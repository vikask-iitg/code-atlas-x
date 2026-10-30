const EXT_LANG: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  vue: "Vue",
  svelte: "Svelte",
  py: "Python",
  java: "Java",
  kt: "Kotlin",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  c: "C",
  h: "C",
  cpp: "C++",
  hpp: "C++",
  swift: "Swift",
  scala: "Scala",
  sql: "SQL",
  prisma: "Prisma",
  graphql: "GraphQL",
  gql: "GraphQL",
  proto: "Protobuf",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "SCSS",
  less: "CSS",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  md: "Markdown",
  mdx: "Markdown",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  dockerfile: "Docker",
  tf: "Terraform",
  ini: "Config",
  cfg: "Config",
  env: "Config",
  txt: "Text",
};

const NAME_LANG: Record<string, string> = {
  dockerfile: "Docker",
  makefile: "Make",
  "docker-compose.yml": "YAML",
  "docker-compose.yaml": "YAML",
  "requirements.txt": "Config",
  "go.mod": "Config",
  "go.sum": "Config",
  gemfile: "Ruby",
};

export const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#e5b400",
  Python: "#3572a5",
  Java: "#b07219",
  Kotlin: "#a97bff",
  Go: "#00add8",
  Rust: "#dea584",
  Ruby: "#cc342d",
  PHP: "#4f5d95",
  "C#": "#178600",
  C: "#555555",
  "C++": "#f34b7d",
  Swift: "#f05138",
  Scala: "#c22d40",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  SQL: "#e38c00",
  Prisma: "#0c344b",
  GraphQL: "#e10098",
  Protobuf: "#7a7a7a",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  JSON: "#8a8a8a",
  YAML: "#cb171e",
  TOML: "#9c4221",
  XML: "#0060ac",
  Markdown: "#4a7fb5",
  Shell: "#89e051",
  Docker: "#384d54",
  Terraform: "#7b42bc",
  Make: "#427819",
  Config: "#9ca3af",
  Text: "#9ca3af",
  Other: "#9ca3af",
};

export function extOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function languageOf(path: string): string {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (NAME_LANG[base]) return NAME_LANG[base];
  if (base.startsWith("dockerfile")) return "Docker";
  if (base.startsWith(".env")) return "Config";
  return EXT_LANG[extOf(path)] ?? "Other";
}

export const CODE_LANGS = new Set([
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "Kotlin",
  "Go",
  "Rust",
  "Ruby",
  "PHP",
  "C#",
  "C",
  "C++",
  "Swift",
  "Scala",
  "Vue",
  "Svelte",
]);

/** Languages whose imports we parse into the dependency graph. */
export const PARSED_LANGS = new Set(["TypeScript", "JavaScript", "Python", "Java", "Go", "Vue", "Svelte"]);

/** Shiki language id for code preview. */
export function shikiLang(path: string): string {
  const ext = extOf(path);
  const base = (path.split("/").pop() ?? "").toLowerCase();
  if (base.startsWith("dockerfile")) return "docker";
  const map: Record<string, string> = {
    ts: "typescript",
    mts: "typescript",
    cts: "typescript",
    tsx: "tsx",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    py: "python",
    java: "java",
    go: "go",
    kt: "kotlin",
    rs: "rust",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    swift: "swift",
    scala: "scala",
    vue: "vue",
    svelte: "svelte",
    sql: "sql",
    prisma: "prisma",
    graphql: "graphql",
    gql: "graphql",
    proto: "proto",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    md: "markdown",
    mdx: "mdx",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    tf: "hcl",
    ini: "ini",
  };
  return map[ext] ?? "text";
}
