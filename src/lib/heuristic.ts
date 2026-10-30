import type { AnalysisPayload, FileSummary } from "./payload";
import type { LlmDiagram } from "./diagramSchema";
import type { NodeKind } from "./types";

/**
 * Deterministic folder-based grouping. Used when no LLM is configured, when the LLM call
 * fails, and as the fallback for unsupported languages (Risks: "Unsupported languages").
 */

const UI_LANGS = new Set(["TypeScript", "JavaScript", "Vue", "Svelte", "HTML"]);
const SERVER_LANGS = new Set(["Python", "Java", "Kotlin", "Go", "Rust", "Ruby", "PHP", "C#", "C", "C++", "Scala", "Swift"]);

const DATASTORES: Record<string, string> = {
  "db:prisma": "Database (Prisma)",
  "db:sqlalchemy": "SQL database",
  "db:postgres": "PostgreSQL",
  "db:mysql": "MySQL",
  "db:sqlite": "SQLite",
  "db:mongoose": "MongoDB",
  "db:mongodb": "MongoDB",
  "db:redis": "Redis",
  "db:drizzle": "SQL database",
  "db:typeorm": "SQL database",
  "db:django-orm": "Django database",
  "db:jpa": "SQL database (JPA)",
  "db:gorm": "SQL database (GORM)",
  "db:supabase": "Supabase",
  "db:firebase": "Firebase",
  "db:indexeddb": "IndexedDB",
  "db:localstorage": "Browser localStorage",
  "storage:s3": "Blob storage (S3)",
  "storage:gcs": "Blob storage (GCS)",
  "storage:filesystem": "Local file system",
};

const EXTERNALS: Record<string, string> = {
  "ext:openai": "OpenAI API",
  "ext:anthropic": "Claude API",
  "ext:gemini": "Gemini API",
  "ext:stripe": "Stripe",
  "ext:twilio": "Twilio",
  "ext:sendgrid": "Email service",
  "ext:auth0": "Auth provider",
  "ext:http": "External HTTP APIs",
  "queue:celery": "Task queue (Celery)",
  "queue:bullmq": "Job queue (BullMQ)",
  "queue:kafka": "Kafka",
};

const titleCase = (s: string) =>
  s
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

interface Cluster {
  key: string; // folder path
  files: FileSummary[];
  own: boolean; // only files directly in the folder
  single?: boolean; // one significant file promoted to its own component
}

function clusterFiles(files: FileSummary[], target = 18): Cluster[] {
  // Start at the top-level folder, then keep splitting the biggest splittable cluster.
  const topOf = (p: string, depth: number) => {
    const parts = p.split("/");
    return parts.length > depth ? parts.slice(0, depth).join("/") : parts.slice(0, -1).join("/") || ".";
  };
  let clusters: Cluster[] = [];
  const init = new Map<string, FileSummary[]>();
  for (const f of files) {
    const k = topOf(f.p, 1);
    init.set(k, [...(init.get(k) ?? []), f]);
  }
  clusters = [...init.entries()].map(([key, fs]) => ({ key, files: fs, own: key === "." }));
  for (let iter = 0; iter < 60 && clusters.length < target; iter++) {
    const splittable = clusters
      .filter((c) => !c.own && c.files.length > 3)
      .map((c) => {
        const depth = c.key === "." ? 1 : c.key.split("/").length + 1;
        const sub = new Map<string, FileSummary[]>();
        for (const f of c.files) {
          const parts = f.p.split("/");
          const k = parts.length > depth ? parts.slice(0, depth).join("/") : `${c.key}#own`;
          sub.set(k, [...(sub.get(k) ?? []), f]);
        }
        return { c, sub };
      })
      .filter((x) => x.sub.size > 1)
      .sort((a, b) => b.c.files.length - a.c.files.length);
    const pick = splittable[0];
    if (!pick || clusters.length - 1 + pick.sub.size > target + 8) break;
    clusters = clusters.filter((c) => c !== pick.c);
    for (const [k, fs] of pick.sub) {
      const own = k.endsWith("#own");
      clusters.push({ key: own ? pick.c.key : k, files: fs, own });
    }
  }
  // Flat packages (e.g. flask/*.py): promote the largest files of big "own" clusters to components.
  for (const c of clusters.filter((c) => c.own && c.files.length > 5)) {
    const room = target - clusters.length;
    if (room <= 1) break;
    const sorted = c.files.slice().sort((a, b) => b.n - a.n);
    const promote = sorted.slice(0, Math.min(room, sorted.length - 1)).filter((f) => f.n >= 40);
    if (!promote.length) continue;
    c.files = c.files.filter((f) => !promote.includes(f));
    for (const f of promote) clusters.push({ key: f.p, files: [f], own: false, single: true });
  }
  return clusters.filter((c) => c.files.length);
}

function kindOf(c: Cluster): NodeKind {
  const tags = new Set(c.files.flatMap((f) => f.t ?? []));
  const key = c.key.toLowerCase();
  const langs = c.files.map((f) => f.l);
  const ui = langs.filter((l) => UI_LANGS.has(l)).length;
  const server = langs.filter((l) => SERVER_LANGS.has(l)).length;
  const hasRoutes = [...tags].some((t) => t.startsWith("route:") && t !== "route:nextjs") || tags.has("entry:server");
  if (/(model|schema|db|database|repo|repositor|storage|store|persist|migration|entity|dao)s?\b/.test(key)) return "persistence";
  const dbFiles = c.files.filter((f) => f.t?.some((t) => t.startsWith("db:") || t.startsWith("storage:"))).length;
  if (dbFiles * 2 >= c.files.length && !hasRoutes && !tags.has("entry")) return "persistence";
  if (hasRoutes || tags.has("route:nextjs") || /(api|server|backend|service|handler|controller|routes?)s?\b/.test(key))
    return server >= ui || hasRoutes || tags.has("route:nextjs") ? "backend" : "frontend";
  if (/(feature|page|view|screen|editor|board|canvas|modal|dialog)s?\b/.test(key)) return ui >= server ? "feature" : "backend";
  if (ui > server) return "frontend";
  return "backend";
}

const ROLE_BY_TAG: [RegExp, (t: string) => string][] = [
  [/^entry:ui$/, () => "boots the web UI"],
  [/^entry:server$/, () => "starts the server"],
  [/^entry:cli$/, () => "provides a command-line entry point"],
  [/^route:/, () => "defines HTTP routes"],
  [/^page:nextjs$/, () => "renders app pages"],
  [/^client:api$/, () => "calls the backend API"],
  [/^db:|^storage:/, (t) => `reads and writes ${DATASTORES[t] ?? "data"}`],
  [/^ext:|^queue:/, (t) => `talks to ${EXTERNALS[t] ?? "external services"}`],
  [/^sched:/, () => "runs scheduled jobs"],
];

const KIND_ROLE: Record<string, [noun: string, alone: string]> = {
  frontend: ["UI code", "Part of the user-facing UI."],
  feature: ["UI feature module", "A feature module of the UI."],
  backend: ["Server-side logic", "Server-side or pipeline logic."],
  persistence: ["Data-access code", "Handles storing and loading data."],
};

/** Plain-language "what is this and why is it here" for folder-based components. */
function describeCluster(c: Cluster, kind: NodeKind, doc: string | undefined, langs: string): string {
  const roles: string[] = [];
  for (const f of c.files)
    for (const t of f.t ?? [])
      for (const [re, fn] of ROLE_BY_TAG) {
        if (!re.test(t)) continue;
        const r = fn(t);
        if (!roles.includes(r)) roles.push(r);
      }
  const where = c.single ? c.key : c.key === "." ? "the project root" : `${c.key}/`;
  const scope = `${c.files.length} ${langs} file${c.files.length > 1 ? "s" : ""} in ${where}`;
  const [noun, alone] = KIND_ROLE[kind] ?? ["Component", "A project component."];
  const lead = roles.length ? `${noun} that ${roles.slice(0, 3).join(", ")}.` : alone;
  return [doc ? (/[.!?]$/.test(doc) ? doc : doc + ".") : null, lead, `Covers ${scope}.`].filter(Boolean).join(" ");
}

function labelOf(c: Cluster): string {
  if (c.single) {
    const base = (c.key.split("/").pop() ?? c.key).replace(/\.[^.]+$/, "");
    return titleCase(base === "__init__" || base === "index" ? (c.key.split("/").slice(-2, -1)[0] ?? base) : base).slice(0, 32);
  }
  const parts = c.key.split("/").filter((p) => p && p !== ".");
  const last = parts[parts.length - 1] ?? "Root";
  const base = ["src", "lib", "app", "pkg", "internal", "cmd"].includes(last.toLowerCase()) && parts.length > 1 ? parts.slice(-2).join(" ") : last;
  if (c.own && (c.key === "." || !parts.length)) return "Project root";
  if (c.own && c.files.some((f) => f.t?.includes("entry:ui"))) return "App shell";
  if (c.own && c.files.some((f) => f.t?.includes("entry:server"))) return /server|api/i.test(base) ? "API server" : `${titleCase(base)} server`;
  if (c.own && c.files.some((f) => f.t?.includes("entry"))) return `${titleCase(base)} entry`;
  return titleCase(c.own ? `${base} root` : base).slice(0, 32) || "Root";
}

function primaryOf(files: FileSummary[]): string {
  const score = (f: FileSummary) =>
    (f.t?.some((t) => t.startsWith("entry")) ? 50 : 0) +
    (/(^|\/)(index|main|app|server|mod)\.\w+$/.test(f.p) ? 20 : 0) +
    (f.n <= 1 ? -100 : 0) +
    (f.i?.length ?? 0) +
    Math.min(f.n / 100, 10);
  return files.slice().sort((a, b) => score(b) - score(a))[0].p;
}

const LAYERS: { kinds: NodeKind[]; label: string; description: string }[] = [
  { kinds: ["frontend", "feature"], label: "Web application", description: "User-facing UI code" },
  { kinds: ["backend"], label: "Services", description: "Application logic, APIs and pipelines" },
  { kinds: ["persistence"], label: "Persistence", description: "Data models and storage access" },
];

export function heuristicDiagram(payload: AnalysisPayload): LlmDiagram {
  const source = payload.files.filter((f) => !(f.t ?? []).includes("test"));
  const files = source.length ? source : payload.files;
  if (!files.length) {
    throw new Error("No recognisable source files to group.");
  }
  const clusters = clusterFiles(files);
  const nodes: LlmDiagram["nodes"] = [];
  const fileToNode = new Map<string, string>();
  const usedLabels = new Map<string, number>();
  for (const [i, c] of clusters.entries()) {
    const kind = kindOf(c);
    let label = labelOf(c);
    const seen = usedLabels.get(label) ?? 0;
    usedLabels.set(label, seen + 1);
    if (seen) label = `${label} ${seen + 1}`;
    const id = `c${i}`;
    const langs = [...new Set(c.files.map((f) => f.l))].slice(0, 3).join(", ");
    const docs = c.files.map((f) => f.s).filter(Boolean)[0];
    nodes.push({
      id,
      label,
      primaryFile: primaryOf(c.files),
      kind,
      groupId: null,
      description: describeCluster(c, kind, docs, langs),
      files: c.files.map((f) => f.p),
    });
    for (const f of c.files) fileToNode.set(f.p, id);
  }

  // Group by layer, but only when more than one layer is present.
  const groups: LlmDiagram["groups"] = [];
  for (const layer of LAYERS) {
    const members = nodes.filter((n) => layer.kinds.includes(n.kind));
    if (!members.length) continue;
    const gid = `layer-${groups.length}`;
    groups.push({ id: gid, label: layer.label, description: layer.description });
    members.forEach((n) => (n.groupId = gid));
  }

  // Import edges aggregated between clusters.
  const weights = new Map<string, number>();
  for (const f of files) {
    const s = fileToNode.get(f.p);
    for (const imp of f.i ?? []) {
      const t = fileToNode.get(imp);
      if (s && t && s !== t) weights.set(`${s}|${t}`, (weights.get(`${s}|${t}`) ?? 0) + 1);
    }
  }
  const kindById = new Map(nodes.map((n) => [n.id, n.kind]));
  const verb = (t: string) => {
    const k = kindById.get(t);
    return k === "persistence" ? "persists via" : k === "frontend" ? "uses" : k === "feature" ? "opens" : "calls";
  };
  const edges: LlmDiagram["edges"] = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k]) => {
      const [s, t] = k.split("|");
      return { source: s, target: t, label: verb(t), style: "sync" as const };
    });

  // Datastores & external services from detections (A4)
  const extra = (map: Record<string, string>, kind: NodeKind, label: (s: string) => string, style: "sync" | "async") => {
    const byName = new Map<string, Set<string>>();
    for (const f of files)
      for (const t of f.t ?? [])
        if (map[t]) byName.set(map[t], new Set([...(byName.get(map[t]) ?? []), f.p]));
    for (const [name, fs] of byName) {
      if (nodes.length >= 34) break;
      const id = `${kind}-${nodes.length}`;
      const users = [...new Set([...fs].map((f) => fileToNode.get(f)).filter(Boolean))] as string[];
      nodes.push({
        id,
        label: name,
        primaryFile: [...fs][0],
        kind,
        groupId: null,
        description: `${name}, used from ${fs.size} file${fs.size > 1 ? "s" : ""}.`,
        files: [...fs],
      });
      for (const u of users.slice(0, 4)) edges.push({ source: u, target: id, label: label(name), style });
    }
  };
  extra(DATASTORES, "datastore", (n) => (/file system/i.test(n) ? "writes files" : "reads / writes"), "sync");
  extra(EXTERNALS, "external", (n) => (/queue|kafka/i.test(n) ? "enqueues jobs" : "calls API"), "async");

  // Frontend -> backend REST calls
  const apiCallers = new Set(files.filter((f) => f.t?.includes("client:api")).map((f) => fileToNode.get(f.p)));
  const backends = nodes.filter((n) => n.kind === "backend" && n.files.some((p) => files.find((f) => f.p === p)?.t?.some((t) => t.startsWith("route:"))));
  for (const c of apiCallers) if (c && backends[0] && c !== backends[0].id) edges.push({ source: c, target: backends[0].id, label: "REST requests", style: "async" });

  // Actors
  const uiEntry = files.filter((f) => f.t?.includes("entry:ui") || (f.l === "HTML" && f.t?.includes("entry")));
  const serverEntry = files.filter((f) => f.t?.includes("entry:server"));
  const cliEntry = files.filter((f) => f.t?.includes("entry:cli") || f.t?.includes("sched:cron"));
  const addActor = (label: string, entries: FileSummary[], verbLabel: string, style: "sync" | "async") => {
    const targets = [...new Set(entries.map((f) => fileToNode.get(f.p)).filter(Boolean))] as string[];
    if (!targets.length) return;
    const id = `actor-${nodes.length}`;
    nodes.unshift({
      id,
      label,
      primaryFile: entries[0].p,
      kind: "actor",
      groupId: null,
      description: `Starts the system through ${entries.map((e) => e.p).slice(0, 3).join(", ")}.`,
      files: entries.map((e) => e.p).slice(0, 5),
    });
    for (const t of targets.slice(0, 3)) edges.push({ source: id, target: t, label: verbLabel, style });
  };
  if (uiEntry.length) addActor("Browser user", uiEntry, "uses app", "sync");
  else if (serverEntry.length) addActor("API client", serverEntry, "HTTP requests", "async");
  if (cliEntry.length) addActor("CLI / scheduled caller", cliEntry, "runs", "async");

  return {
    title: payload.projectName,
    summary: `Folder-based architecture of ${payload.projectName}: ${clusters.length} components across ${groups.length || 1} layer${groups.length === 1 ? "" : "s"}${payload.stack.length ? `, built with ${payload.stack.slice(0, 5).map((s) => s.name).join(", ")}` : ""}.`,
    groups,
    nodes,
    edges,
  };
}
