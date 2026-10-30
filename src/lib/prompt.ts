import type { AnalysisPayload } from "./payload";
import type { Diagram } from "./types";

export const SYSTEM_PROMPT = `You are a software architect producing an architecture diagram of an uploaded codebase, in the style of GitDiagram.

You receive per-file summaries produced by static analysis (no full source): path, language, line count, top symbols, a doc comment, detected tags, internal imports (resolved file paths) and external packages. Tags mean: entry / entry:ui / entry:server / entry:cli = entry points; route:* = HTTP routes; db:* and storage:* = data stores; ext:* = external APIs; client:api = frontend code calling the backend over HTTP; queue:* / sched:* = async work; test = test file.

Produce a diagram that flows top-to-bottom: actors (who or what starts the system) at the top, then layered groups of components, then data stores and external services at the bottom.

Node kinds:
- actor: a person or caller outside the code (browser user, CLI user, scheduled job, webhook caller)
- frontend: UI shell, routing, layout, shared UI components
- feature: a feature/editor module in the UI (pages, editors, domain screens)
- backend: server, API router, service, worker, pipeline, agent
- persistence: code that stores or loads data (models, repositories, storage adapters)
- datastore: a database, browser storage, file storage, cache or bucket
- external: a third-party service or API

Rules:
- Aim for 10-35 nodes. Merge small related folders; split a large folder only when it holds clearly distinct responsibilities.
- Every node's "files" must list exact file paths from the input, or folder prefixes ending in "/" that exist in the input. Never invent paths. "primaryFile" must be one exact input path.
- Actors, datastores and external nodes must still cite real files: the entry-point file for actors, and the files that use the store/service for datastores and externals.
- Put components in 2-6 groups (layers) such as "Web application", "Canvas editing", "API services", "Agent pipeline", "Persistence". Actors, datastores and externals usually have groupId null.
- Ignore tests, build output and tooling unless they are central to the project.
- Edge labels are short verbs of 2-3 words ("routes auth", "stores thumbnails", "renders board"). Use style "sync" for in-process calls and imports, "async" for network, queue, scheduled or event-driven links.
- Prefer edges the import graph supports; add an inferred edge only when the evidence is strong (e.g. client:api to a route module). Keep the diagram readable: at most about 1.5 edges per node.
- Node labels are human names of 1-4 words, not file names.
- Write each node description for a developer new to the codebase, in 1-2 sentences: what the component does and why it exists in this architecture (the role it plays for the rest of the system). Shown when the user hovers the box.`;

export function formatPayload(p: AnalysisPayload): string {
  const lines: string[] = [];
  lines.push(`# Project: ${p.projectName}`);
  lines.push(
    `Files: ${p.stats.totalFiles} uploaded, ${p.stats.ignoredFiles} ignored, ${p.stats.analysedFiles} analysed (${p.stats.totalLines} lines).`,
  );
  if (p.stack.length) lines.push(`Detected stack: ${p.stack.map((s) => `${s.name} (${s.kind}, from ${s.source})`).join("; ")}`);
  if (p.readme) lines.push(`\n## README (excerpt, secrets redacted)\n${p.readme.slice(0, 3000)}`);
  lines.push(`\n## Source files`);
  lines.push(`Format: path | language | lines | tags | symbols | doc | imports -> [internal files] | packages`);
  for (const f of p.files) {
    const parts = [f.p, f.l, String(f.n)];
    parts.push(f.t?.length ? f.t.join(",") : "-");
    parts.push(f.y?.length ? f.y.join(",") : "-");
    parts.push(f.s ? f.s.replace(/\|/g, "/") : "-");
    parts.push(f.i?.length ? `-> ${f.i.join(", ")}` : "-");
    parts.push(f.x?.length ? f.x.join(",") : "-");
    lines.push(parts.join(" | "));
  }
  if (p.otherFiles.length) {
    lines.push(`\n## Other files (config, docs, assets)`);
    lines.push(p.otherFiles.join("\n"));
  }
  return lines.join("\n");
}

export function formatPrevious(d: Diagram): string {
  const out = [`## Previous diagram (to refine)`, `Groups: ${d.groups.map((g) => `${g.id}="${g.label}"`).join(", ")}`];
  for (const n of d.nodes)
    out.push(`- node ${n.id} "${n.label}" kind=${n.kind} group=${n.groupId ?? "none"} files=${n.files.slice(0, 12).join(",")}${n.files.length > 12 ? ",…" : ""}`);
  for (const e of d.edges) out.push(`- edge ${e.source} -> ${e.target} "${e.label}" ${e.style}`);
  return out.join("\n");
}
