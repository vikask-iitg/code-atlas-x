import { z } from "zod";
import type { Diagram, DiagramEdge, DiagramNode, NodeKind } from "./types";
import type { AnalysisPayload } from "./payload";
import { allPaths } from "./payload";

export const NODE_KINDS = ["actor", "frontend", "feature", "backend", "persistence", "datastore", "external"] as const;

/** Structured output schema the LLM must fill (A5). */
export const LlmDiagramSchema = z.object({
  title: z.string().describe("Short project title"),
  summary: z.string().describe("2-3 sentence overview of the architecture"),
  groups: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
    }),
  ),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string().describe("Human name, 1-4 words"),
      primaryFile: z.string().describe("Exact path of the most representative file"),
      kind: z.enum(NODE_KINDS),
      groupId: z.string().nullable(),
      description: z.string().describe("1-2 sentences: what it does and why it exists in the architecture"),
      files: z.array(z.string()).describe("Exact file paths, or folder prefixes ending in '/'"),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      label: z.string().describe("2-3 word verb phrase"),
      style: z.enum(["sync", "async"]),
    }),
  ),
});

export type LlmDiagram = z.infer<typeof LlmDiagramSchema>;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "n";

/**
 * Validate and ground an LLM (or heuristic) diagram against the upload (A6):
 * - every node must map to >= 1 real file; cited paths not in the upload are dropped
 * - folder prefixes ("src/api/") are expanded to the real files under them
 * - edges are marked "detected" when the import graph confirms them, else "inferred"
 */
export function groundDiagram(
  raw: LlmDiagram,
  payload: AnalysisPayload,
  generatedBy: Diagram["generatedBy"],
): { diagram: Diagram; problems: string[] } {
  const paths = allPaths(payload);
  const sorted = [...paths].sort();
  const problems: string[] = [];

  const groupIds = new Map<string, string>();
  const groups = raw.groups.map((g, i) => {
    const id = `g-${slug(g.id || g.label)}-${i}`;
    groupIds.set(g.id, id);
    return { id, label: g.label, description: g.description };
  });

  const nodeIds = new Map<string, string>();
  const nodes: DiagramNode[] = [];
  for (const [i, n] of raw.nodes.entries()) {
    const files = new Set<string>();
    const bad: string[] = [];
    for (const f of n.files) {
      const clean = f.replace(/^\.?\//, "");
      if (paths.has(clean)) files.add(clean);
      else if (clean.endsWith("/") || !clean.includes(".")) {
        const prefix = clean.endsWith("/") ? clean : clean + "/";
        const under = sorted.filter((p) => p.startsWith(prefix));
        if (under.length) under.forEach((p) => files.add(p));
        else bad.push(f);
      } else bad.push(f);
    }
    let primary = n.primaryFile.replace(/^\.?\//, "");
    if (!paths.has(primary)) {
      if (n.primaryFile) bad.push(n.primaryFile);
      primary = [...files][0] ?? "";
    } else files.add(primary);
    if (bad.length) problems.push(`Node "${n.label}" cited paths not in the upload: ${bad.slice(0, 5).join(", ")}`);
    if (files.size === 0) {
      problems.push(`Node "${n.label}" rejected: it maps to no real file.`);
      continue;
    }
    const id = `n-${slug(n.id || n.label)}-${i}`;
    nodeIds.set(n.id, id);
    nodes.push({
      id,
      label: n.label,
      primaryFile: primary,
      kind: (NODE_KINDS as readonly string[]).includes(n.kind) ? (n.kind as NodeKind) : "backend",
      groupId: n.groupId ? (groupIds.get(n.groupId) ?? null) : null,
      description: n.description,
      files: [...files],
    });
  }

  // file -> imports, for edge verification
  const importMap = new Map<string, Set<string>>();
  for (const f of payload.files) importMap.set(f.p, new Set(f.i ?? []));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const seen = new Set<string>();
  const edges: DiagramEdge[] = [];
  for (const e of raw.edges) {
    const s = nodeIds.get(e.source);
    const t = nodeIds.get(e.target);
    if (!s || !t || s === t) continue;
    const key = `${s}->${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const src = byId.get(s)!;
    const tgt = byId.get(t)!;
    const tgtFiles = new Set(tgt.files);
    const srcFiles = new Set(src.files);
    const detected =
      src.files.some((f) => [...(importMap.get(f) ?? [])].some((i) => tgtFiles.has(i))) ||
      // reverse import (e.g. a router module registered by the app) still proves a code link
      tgt.files.some((f) => [...(importMap.get(f) ?? [])].some((i) => srcFiles.has(i))) ||
      // datastore / external / actor nodes are grounded via the files that use them
      ((tgt.kind === "datastore" || tgt.kind === "external") && src.files.some((f) => tgtFiles.has(f))) ||
      (src.kind === "actor" && tgt.files.some((f) => srcFiles.has(f)));
    edges.push({
      id: `e-${edges.length}`,
      source: s,
      target: t,
      label: e.label.split(/\s+/).slice(0, 4).join(" "),
      style: e.style === "async" ? "async" : "sync",
      basis: detected ? "detected" : "inferred",
    });
  }

  // drop empty groups
  const usedGroups = new Set(nodes.map((n) => n.groupId).filter(Boolean));
  const finalGroups = groups.filter((g) => usedGroups.has(g.id));

  const diagram: Diagram = {
    id: crypto.randomUUID(),
    title: raw.title || payload.projectName,
    summary: raw.summary,
    groups: finalGroups,
    nodes,
    edges,
    generatedBy,
    warnings: problems.length ? problems.slice(0, 20) : undefined,
    collapsedGroups: autoCollapse(nodes),
    createdAt: new Date().toISOString(),
  };
  return { diagram, problems };
}

/** Above 35 nodes, collapse the largest groups until the visible count fits (diagram rules). */
export function autoCollapse(nodes: DiagramNode[], max = 35): string[] {
  const sizes = new Map<string, number>();
  for (const n of nodes) if (n.groupId) sizes.set(n.groupId, (sizes.get(n.groupId) ?? 0) + 1);
  let visible = nodes.length;
  const out: string[] = [];
  for (const [g, size] of [...sizes.entries()].sort((a, b) => b[1] - a[1])) {
    if (visible <= max) break;
    out.push(g);
    visible -= size - 1;
  }
  return out;
}
