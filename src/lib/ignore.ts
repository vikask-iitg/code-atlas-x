import type { IgnoreReason } from "./types";
import { extOf } from "./languages";

/** Default ignore rules (U4). Users can edit these in the scan preview (U5). */
export const DEFAULT_RULES: string[] = [
  ".git/",
  ".svn/",
  ".hg/",
  "node_modules/",
  "bower_components/",
  ".venv/",
  "venv/",
  "env/",
  "site-packages/",
  "__pycache__/",
  ".mypy_cache/",
  ".pytest_cache/",
  ".ruff_cache/",
  ".tox/",
  "dist/",
  "build/",
  "out/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".cache/",
  ".parcel-cache/",
  "coverage/",
  "target/",
  "vendor/",
  ".gradle/",
  ".idea/",
  ".vscode/",
  ".DS_Store",
  "__MACOSX/",
  "*.min.js",
  "*.map",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
];

const REASON_BY_RULE: Record<string, IgnoreReason> = {
  ".git/": "vcs",
  ".svn/": "vcs",
  ".hg/": "vcs",
  "node_modules/": "dependency",
  "bower_components/": "dependency",
  ".venv/": "dependency",
  "venv/": "dependency",
  "env/": "dependency",
  "site-packages/": "dependency",
  "vendor/": "dependency",
  "dist/": "build",
  "build/": "build",
  "out/": "build",
  ".next/": "build",
  ".nuxt/": "build",
  ".svelte-kit/": "build",
  "target/": "build",
  "coverage/": "build",
  "*.min.js": "build",
  "*.map": "build",
};

const BINARY_EXT = new Set(
  (
    "png jpg jpeg gif webp bmp ico icns tiff psd ai sketch fig svgz " +
    "mp3 mp4 wav ogg webm mov avi mkv flac m4a " +
    "woff woff2 ttf otf eot " +
    "zip gz tgz tar rar 7z bz2 xz jar war ear whl egg " +
    "exe dll so dylib a o obj class pyc pyo pyd bin dat db sqlite sqlite3 " +
    "pdf doc docx xls xlsx ppt pptx key numbers pages " +
    "glb gltf fbx blend stl usdz wasm node lockb pkl pt pth onnx h5 npy npz parquet"
  ).split(" "),
);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tiff"]);

/** Max size of a single text file we analyse. */
export const MAX_TEXT_FILE = 1_000_000;

interface CompiledRule {
  raw: string;
  negate: boolean;
  re: RegExp;
  reason: IgnoreReason;
}

function globToRegex(glob: string): string {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return re;
}

/**
 * Compile a gitignore-style rule. Supports `dir/`, `*.ext`, `/anchored`, `**`, `!negation`.
 * `base` scopes rules from nested .gitignore files.
 */
export function compileRule(rawRule: string, reason: IgnoreReason, base = ""): CompiledRule | null {
  let rule = rawRule.trim();
  if (!rule || rule.startsWith("#")) return null;
  const negate = rule.startsWith("!");
  if (negate) rule = rule.slice(1);
  const dirOnly = rule.endsWith("/");
  if (dirOnly) rule = rule.slice(0, -1);
  const anchored = rule.startsWith("/") || rule.slice(0, -1).includes("/");
  if (rule.startsWith("/")) rule = rule.slice(1);
  const body = globToRegex(rule);
  const prefix = base ? escapeRe(base) + "/" : "";
  const lead = anchored ? "^" + prefix : "^" + prefix + "(?:.*/)?";
  // dir rules match anything below the dir; file rules match the path or anything below it
  const tail = dirOnly ? "/" : "(?:/|$)";
  return { raw: rawRule, negate, re: new RegExp(lead + body + tail), reason };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class IgnoreMatcher {
  private rules: CompiledRule[] = [];

  constructor(userRules: string[], gitignores: { base: string; content: string }[] = []) {
    for (const r of userRules) {
      const c = compileRule(r, REASON_BY_RULE[r.trim()] ?? guessReason(r));
      if (c) this.rules.push(c);
    }
    for (const g of gitignores) {
      for (const line of g.content.split(/\r?\n/)) {
        const c = compileRule(line, "gitignore", g.base);
        if (c) this.rules.push(c);
      }
    }
  }

  /** Returns the ignore reason, or null if the file should be kept. */
  match(path: string, size: number): IgnoreReason | null {
    let hit: IgnoreReason | null = null;
    for (const r of this.rules) {
      if (r.re.test(path)) hit = r.negate ? null : r.reason;
    }
    if (hit) return hit;
    const ext = extOf(path);
    if (IMAGE_EXT.has(ext) && size > 1_000_000) return "large-image";
    if (BINARY_EXT.has(ext)) return "binary";
    if (size > MAX_TEXT_FILE) return "too-large";
    return null;
  }
}

function guessReason(rule: string): IgnoreReason {
  if (/lock/i.test(rule)) return "lockfile";
  if (/cache/i.test(rule)) return "cache";
  return "custom";
}

export const REASON_LABELS: Record<string, string> = {
  dependency: "Dependencies (node_modules, .venv…)",
  vcs: "Version control (.git)",
  build: "Build output (dist, build, .next…)",
  cache: "Caches",
  lockfile: "Lockfiles",
  binary: "Binaries & media",
  "large-image": "Images > 1 MB",
  gitignore: "Project .gitignore",
  custom: "Custom rules",
  unsupported: "Unsupported",
  "too-large": "Text files > 1 MB",
  "outside-selection": "Outside selected folders",
};
