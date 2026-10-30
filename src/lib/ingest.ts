import JSZip from "jszip";
import type { IgnoreReason, RawEntry, ScanResult } from "./types";
import { IgnoreMatcher, DEFAULT_RULES } from "./ignore";

export const LIMITS = {
  zipBytes: 200 * 1024 * 1024, // U1: 200 MB compressed
  extractedBytes: 1024 * 1024 * 1024, // U1: 1 GB extracted
  maxRatio: 100, // U1: zip-bomb ratio
  maxSourceFiles: 5000, // U6
};

export class UploadError extends Error {
  constructor(
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

const fmtMB = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** Normalise an archive path and reject traversal / absolute paths. Returns null if unsafe. */
export function safePath(p: string): string | null {
  const norm = p.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return null;
  const parts = norm.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  return parts.join("/");
}

interface Collected {
  name: string;
  entries: RawEntry[];
  rejected: number;
}

export async function readZip(file: File): Promise<Collected> {
  if (file.size > LIMITS.zipBytes) {
    throw new UploadError(
      `This .zip is ${fmtMB(file.size)}; the limit is 200 MB compressed.`,
      "Remove dependency folders (node_modules, .venv) before zipping, or upload a sub-folder.",
    );
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new UploadError(
      "We couldn't read this file as a .zip archive.",
      "It may be corrupted or use an unsupported format (.tar.gz and .7z are not supported yet).",
    );
  }
  let total = 0;
  const entries: RawEntry[] = [];
  let rejected = 0;
  zip.forEach((relPath, obj) => {
    if (obj.dir) return;
    // Symlinks: unix mode S_IFLNK
    const perms = obj.unixPermissions;
    if (typeof perms === "number" && (perms & 0o170000) === 0o120000) {
      rejected++;
      return;
    }
    const path = safePath(relPath);
    if (!path) {
      rejected++;
      return;
    }
    // JSZip keeps sizes from the central directory on the internal _data object.
    const data = (obj as unknown as { _data?: { uncompressedSize?: number } })._data;
    const size = data?.uncompressedSize ?? 0;
    total += size;
    entries.push({ path, size, read: () => obj.async("string") });
  });
  if (total > LIMITS.extractedBytes) {
    throw new UploadError(
      `This archive expands to ${fmtMB(total)}; the limit is 1 GB extracted.`,
      "Upload a sub-folder or remove large assets.",
    );
  }
  if (file.size > 0 && total / file.size > LIMITS.maxRatio) {
    throw new UploadError(
      `This archive's compression ratio is ${Math.round(total / file.size)}:1, above the 100:1 safety limit.`,
      "Archives with extreme ratios are rejected as potential zip bombs.",
    );
  }
  return { name: file.name.replace(/\.zip$/i, ""), entries, rejected };
}

/** Loose files or a folder picked with webkitdirectory. */
export function readFileList(files: File[]): Collected {
  const entries: RawEntry[] = [];
  let rejected = 0;
  let total = 0;
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const path = safePath(rel);
    if (!path) {
      rejected++;
      continue;
    }
    total += f.size;
    entries.push({ path, size: f.size, read: () => f.text() });
  }
  if (total > LIMITS.extractedBytes) {
    throw new UploadError(`These files total ${fmtMB(total)}; the limit is 1 GB.`, "Pick a smaller folder.");
  }
  const first = entries[0]?.path.split("/");
  const name = first && first.length > 1 ? first[0] : "Uploaded files";
  return { name, entries, rejected };
}

/** Walk a drag-and-dropped folder via the FileSystem Entry API. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[] | null> {
  const items = Array.from(dt.items ?? []);
  const roots = items
    .map((it) => (it.kind === "file" ? it.webkitGetAsEntry?.() : null))
    .filter(Boolean) as FileSystemEntry[];
  if (!roots.some((r) => r.isDirectory)) return null;
  const out: File[] = [];
  async function walk(entry: FileSystemEntry, prefix: string) {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      Object.defineProperty(file, "webkitRelativePath", { value: prefix + entry.name });
      out.push(file);
    } else if (entry.isDirectory) {
      // Skip heavy dependency folders early so huge drops stay fast.
      if (["node_modules", ".git", ".venv", "venv", "__pycache__"].includes(entry.name)) return;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, prefix + entry.name + "/");
      } while (batch.length > 0);
    }
  }
  for (const r of roots) await walk(r, "");
  return out;
}

/** Strip a single shared top-level folder (e.g. "Canavas/") and use it as the project name. */
function stripCommonRoot(c: Collected): Collected {
  const firsts = new Set(c.entries.map((e) => e.path.split("/")[0]));
  if (firsts.size === 1 && c.entries.every((e) => e.path.includes("/"))) {
    const root = [...firsts][0];
    return {
      name: root,
      rejected: c.rejected,
      entries: c.entries.map((e) => ({ ...e, path: e.path.slice(root.length + 1) })),
    };
  }
  return c;
}

/** Apply ignore rules + .gitignore files and produce the scan preview (U4, U5). */
export async function scan(
  collected: Collected,
  rules: string[] = DEFAULT_RULES,
  selectedFolders?: string[] | null,
): Promise<ScanResult> {
  const c = stripCommonRoot(collected);
  const gitignores: { base: string; content: string }[] = [];
  const pre = new IgnoreMatcher(rules);
  for (const e of c.entries) {
    if (e.path === ".gitignore" || e.path.endsWith("/.gitignore")) {
      if (pre.match(e.path, e.size)) continue;
      try {
        gitignores.push({ base: e.path.split("/").slice(0, -1).join("/"), content: await e.read() });
      } catch {
        /* unreadable gitignore is fine to skip */
      }
    }
  }
  const matcher = new IgnoreMatcher(rules, gitignores);
  const kept: RawEntry[] = [];
  const ignored: { path: string; reason: IgnoreReason }[] = [];
  const byReason: Record<string, number> = {};
  const ignoredDirs = new Map<string, number>();
  let totalBytes = 0;
  const topOf = (p: string) => (p.includes("/") ? p.split("/")[0] : ".");
  const topCounts = new Map<string, number>();
  for (const e of c.entries) {
    totalBytes += e.size;
    const reason = matcher.match(e.path, e.size);
    if (reason) {
      ignored.push({ path: e.path, reason });
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      const d = ignoredDir(e.path);
      if (d) ignoredDirs.set(d, (ignoredDirs.get(d) ?? 0) + 1);
      continue;
    }
    const top = topOf(e.path);
    topCounts.set(top, (topCounts.get(top) ?? 0) + 1);
    if (selectedFolders?.length && !selectedFolders.includes(top)) {
      ignored.push({ path: e.path, reason: "custom" });
      byReason["outside-selection"] = (byReason["outside-selection"] ?? 0) + 1;
      continue;
    }
    kept.push(e);
  }
  return {
    projectName: c.name,
    totalFiles: c.entries.length + c.rejected,
    totalBytes,
    kept,
    ignored,
    ignoredByReason: byReason,
    ignoredTopDirs: [...ignoredDirs.entries()]
      .map(([dir, count]) => ({ dir, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    topFolders: [...topCounts.entries()]
      .map(([dir, count]) => ({ dir, count }))
      .sort((a, b) => b.count - a.count),
    rules,
  };
}

function ignoredDir(path: string): string | null {
  const parts = path.split("/");
  const heavy = parts.findIndex((p) =>
    ["node_modules", ".venv", "venv", ".git", "dist", "build", ".next", "__pycache__", "target", "vendor"].includes(p),
  );
  if (heavy >= 0) return parts.slice(0, heavy + 1).join("/") + "/";
  return null;
}
