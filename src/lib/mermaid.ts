import type { Diagram } from "./types";
import { visibleModel } from "./layout";

const esc = (s: string) => s.replace(/"/g, "#quot;").replace(/[<>]/g, "");
const mid = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");

/** Serialise the diagram JSON to Mermaid flowchart source (E2). */
export function toMermaid(d: Diagram): string {
  const { nodes, edges } = visibleModel(d);
  const lines = ["flowchart TD"];
  const shape = (n: (typeof nodes)[number]) => {
    const file = n.primaryFile.split("/").pop();
    const text = n.kind === "actor" || n.kind === "datastore" ? esc(n.label) : `${esc(n.label)}<br/>[${esc(file ?? "")}]`;
    if (n.kind === "actor") return `${mid(n.id)}(("${text}"))`;
    if (n.kind === "datastore") return `${mid(n.id)}[("${text}")]`;
    if (n.kind === "collapsed") return `${mid(n.id)}[["${esc(n.label)} (${n.memberCount} components)"]]`;
    return `${mid(n.id)}["${text}"]`;
  };
  for (const n of nodes.filter((n) => !n.groupId)) lines.push(`  ${shape(n)}`);
  for (const g of d.groups) {
    const members = nodes.filter((n) => n.groupId === g.id);
    if (!members.length) continue;
    lines.push(`  subgraph ${mid(g.id)}["${esc(g.label)}"]`);
    for (const n of members) lines.push(`    ${shape(n)}`);
    lines.push("  end");
  }
  for (const e of edges) {
    const arrow = e.style === "async" ? "-.->" : "-->";
    lines.push(`  ${mid(e.source)} ${arrow}|"${esc(e.label)}"| ${mid(e.target)}`);
  }
  const classes: Record<string, string> = {
    actor: "fill:#dbeafe,stroke:#60a5fa,color:#1e3a8a",
    frontend: "fill:#bfdbfe,stroke:#3b82f6,color:#1e3a8a",
    feature: "fill:#fef08a,stroke:#ca8a04,color:#713f12",
    backend: "fill:#bbf7d0,stroke:#16a34a,color:#14532d",
    persistence: "fill:#fecdd3,stroke:#e11d48,color:#881337",
    datastore: "fill:#fecdd3,stroke:#e11d48,color:#881337",
    external: "fill:#e9d5ff,stroke:#9333ea,color:#581c87",
    collapsed: "fill:#e5e7eb,stroke:#6b7280,color:#111827",
  };
  for (const [k, v] of Object.entries(classes)) lines.push(`  classDef ${k} ${v}`);
  for (const k of Object.keys(classes)) {
    const ids = nodes.filter((n) => n.kind === k).map((n) => mid(n.id));
    if (ids.length) lines.push(`  class ${ids.join(",")} ${k}`);
  }
  return lines.join("\n");
}
