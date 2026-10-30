import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import type { Diagram, DiagramEdge, DiagramNode, NodeKind } from "./types";

export type Pt = { x: number; y: number };

export type VisibleNode = {
  id: string;
  kind: NodeKind | "collapsed";
  label: string;
  primaryFile: string;
  groupId: string | null;
  description: string;
  files: string[];
  memberCount?: number; // collapsed groups
  width: number;
  height: number;
};

export interface VisibleEdge extends DiagramEdge {
  originalIds: string[];
}

export interface LaidOut {
  nodes: (VisibleNode & { x: number; y: number })[]; // absolute
  groups: { id: string; label: string; description?: string; x: number; y: number; width: number; height: number }[];
  edges: (VisibleEdge & { points?: Pt[]; labelPos?: Pt })[];
}

const elk = new ELK();

export function nodeSize(kind: VisibleNode["kind"], label: string, file: string): { width: number; height: number } {
  if (kind === "actor") return { width: 104, height: 104 };
  const text = Math.max(label.length * 7.6, (file.split("/").pop() ?? "").length * 6.6 + 14);
  const width = Math.round(Math.min(260, Math.max(kind === "datastore" ? 150 : 170, text + 36)));
  if (kind === "datastore") return { width, height: 86 };
  if (kind === "collapsed") return { width: Math.max(width, 200), height: 70 };
  return { width, height: 58 };
}

/** Apply hide/collapse state and return the nodes/edges that should be drawn. */
export function visibleModel(d: Diagram): { nodes: VisibleNode[]; edges: VisibleEdge[] } {
  const hidden = new Set(d.hiddenGroups ?? []);
  const collapsed = new Set(d.collapsedGroups ?? []);
  const remap = new Map<string, string | null>();
  const nodes: VisibleNode[] = [];
  const collapsedMembers = new Map<string, DiagramNode[]>();
  for (const n of d.nodes) {
    if (n.groupId && hidden.has(n.groupId)) {
      remap.set(n.id, null);
      continue;
    }
    if (n.groupId && collapsed.has(n.groupId)) {
      const gid = `collapsed:${n.groupId}`;
      remap.set(n.id, gid);
      collapsedMembers.set(n.groupId, [...(collapsedMembers.get(n.groupId) ?? []), n]);
      continue;
    }
    remap.set(n.id, n.id);
    nodes.push({ ...n, ...nodeSize(n.kind, n.label, n.primaryFile) });
  }
  for (const [gid, members] of collapsedMembers) {
    const g = d.groups.find((x) => x.id === gid);
    const label = g?.label ?? "Group";
    nodes.push({
      id: `collapsed:${gid}`,
      kind: "collapsed",
      label,
      primaryFile: members[0].primaryFile,
      groupId: null,
      description: g?.description ?? "",
      files: members.flatMap((m) => m.files),
      memberCount: members.length,
      ...nodeSize("collapsed", label, ""),
    });
  }
  const edgeMap = new Map<string, VisibleEdge>();
  for (const e of d.edges) {
    const s = remap.get(e.source);
    const t = remap.get(e.target);
    if (!s || !t || s === t) continue;
    const key = `${s}->${t}`;
    const ex = edgeMap.get(key);
    if (ex) {
      ex.originalIds.push(e.id);
      if (e.basis === "detected") ex.basis = "detected";
      continue;
    }
    edgeMap.set(key, { ...e, id: s === e.source && t === e.target ? e.id : `agg-${key}`, source: s, target: t, originalIds: [e.id] });
  }
  return { nodes, edges: [...edgeMap.values()] };
}

export async function layoutDiagram(d: Diagram): Promise<LaidOut> {
  const { nodes, edges } = visibleModel(d);
  const groupIds = new Set(nodes.map((n) => n.groupId).filter(Boolean) as string[]);
  const groups = d.groups.filter((g) => groupIds.has(g.id));

  // Layer hints so actors sit on top and data stores at the bottom.
  const layerHint = (k: VisibleNode["kind"]) =>
    k === "actor" ? "FIRST" : k === "datastore" || k === "external" ? "LAST" : "NONE";

  const toElk = (n: VisibleNode): ElkNode => ({
    id: n.id,
    width: n.width,
    height: n.height,
    layoutOptions: { "elk.layered.layering.layerConstraint": layerHint(n.kind) },
  });

  const children: ElkNode[] = [
    ...nodes.filter((n) => !n.groupId).map(toElk),
    ...groups.map(
      (g): ElkNode => ({
        id: g.id,
        layoutOptions: {
          "elk.padding": "[top=46,left=24,bottom=24,right=24]",
          "elk.direction": "DOWN",
          "elk.spacing.nodeNode": "36",
          "elk.layered.spacing.nodeNodeBetweenLayers": "56",
        },
        children: nodes.filter((n) => n.groupId === g.id).map((n) => ({ id: n.id, width: n.width, height: n.height })),
      }),
    ),
  ];

  const elkEdges: ElkExtendedEdge[] = edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
    labels: [{ id: `${e.id}-l`, text: e.label, width: Math.round(e.label.length * 6.4 + 14), height: 18 }],
  }));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.json.edgeCoords": "ROOT",
      "elk.json.shapeCoords": "ROOT",
      "elk.spacing.nodeNode": "44",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.edgeNode": "20",
      "elk.spacing.edgeEdge": "12",
      "elk.spacing.edgeLabel": "4",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeLabels.placement": "CENTER",
      "elk.layered.mergeEdges": "false",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
    },
    children,
    edges: elkEdges,
  };

  let res: ElkNode;
  try {
    res = await elk.layout(graph);
  } catch {
    // Fallback: simple grid if ELK chokes on an odd graph
    return gridLayout(nodes, groups, edges);
  }

  const pos = new Map<string, { x: number; y: number; width: number; height: number }>();
  const walk = (n: ElkNode) => {
    for (const c of n.children ?? []) {
      pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 });
      walk(c);
    }
  };
  walk(res);
  const elkEdgeById = new Map<string, ElkExtendedEdge>();
  const collectEdges = (n: ElkNode) => {
    for (const e of n.edges ?? []) elkEdgeById.set(e.id, e as ElkExtendedEdge);
    (n.children ?? []).forEach(collectEdges);
  };
  collectEdges(res);

  return {
    nodes: nodes.map((n) => ({ ...n, x: pos.get(n.id)?.x ?? 0, y: pos.get(n.id)?.y ?? 0 })),
    groups: groups.map((g) => ({ ...g, ...(pos.get(g.id) ?? { x: 0, y: 0, width: 200, height: 100 }) })),
    edges: edges.map((e) => {
      const el = elkEdgeById.get(e.id);
      const sec = el?.sections?.[0];
      const points = sec ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint] : undefined;
      const lab = el?.labels?.[0];
      const labelPos =
        lab && lab.x != null && lab.y != null ? { x: lab.x + (lab.width ?? 0) / 2, y: lab.y + (lab.height ?? 0) / 2 } : undefined;
      return { ...e, points, labelPos };
    }),
  };
}

function gridLayout(nodes: VisibleNode[], groups: Diagram["groups"], edges: VisibleEdge[]): LaidOut {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  return {
    nodes: nodes.map((n, i) => ({ ...n, groupId: null, x: (i % cols) * 300, y: Math.floor(i / cols) * 160 })),
    groups: [],
    edges: edges.map((e) => ({ ...e })),
  };
  void groups;
}

// ---------- edge path with line-jump arcs ----------

export interface Jump {
  x: number;
  y: number;
}

/** For every horizontal segment that crosses another edge's vertical segment, record a jump. */
export function computeJumps(edges: { id: string; points?: Pt[] }[]): Map<string, Jump[]> {
  const vertical: { id: string; x: number; y1: number; y2: number }[] = [];
  for (const e of edges) {
    const p = e.points;
    if (!p) continue;
    for (let i = 0; i < p.length - 1; i++) {
      if (Math.abs(p[i].x - p[i + 1].x) < 0.5) vertical.push({ id: e.id, x: p[i].x, y1: Math.min(p[i].y, p[i + 1].y), y2: Math.max(p[i].y, p[i + 1].y) });
    }
  }
  const out = new Map<string, Jump[]>();
  for (const e of edges) {
    const p = e.points;
    if (!p) continue;
    const jumps: Jump[] = [];
    for (let i = 0; i < p.length - 1; i++) {
      if (Math.abs(p[i].y - p[i + 1].y) > 0.5) continue;
      const y = p[i].y;
      const x1 = Math.min(p[i].x, p[i + 1].x);
      const x2 = Math.max(p[i].x, p[i + 1].x);
      for (const v of vertical) {
        if (v.id === e.id) continue;
        if (v.x > x1 + 8 && v.x < x2 - 8 && y > v.y1 + 2 && y < v.y2 - 2) jumps.push({ x: v.x, y });
      }
    }
    if (jumps.length) out.set(e.id, jumps);
  }
  return out;
}

export function routedPath(points: Pt[], jumps: Jump[] = [], r = 5, corner = 6): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    // shorten segment ends for rounded corners (except at path ends)
    const startCut = i === 0 ? 0 : corner;
    const endCut = i === points.length - 2 ? 0 : corner;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = len ? (b.x - a.x) / len : 0;
    const uy = len ? (b.y - a.y) / len : 0;
    const sc = Math.min(startCut, len / 2);
    const ec = Math.min(endCut, len / 2);
    const end = { x: b.x - ux * ec, y: b.y - uy * ec };
    if (horizontal && jumps.length) {
      const dir = Math.sign(b.x - a.x) || 1;
      const onSeg = jumps
        .filter((j) => Math.abs(j.y - a.y) < 0.5 && (j.x - a.x) * dir > sc + r && (b.x - j.x) * dir > ec + r)
        .sort((p, q) => (p.x - q.x) * dir);
      for (const j of onSeg) {
        d += ` L ${j.x - dir * r} ${j.y} A ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${j.x + dir * r} ${j.y}`;
      }
    }
    d += ` L ${end.x} ${end.y}`;
    if (i < points.length - 2) {
      const c = points[i + 2];
      const len2 = Math.hypot(c.x - b.x, c.y - b.y);
      const cut2 = Math.min(corner, len2 / 2);
      const nx = len2 ? (c.x - b.x) / len2 : 0;
      const ny = len2 ? (c.y - b.y) / len2 : 0;
      d += ` Q ${b.x} ${b.y} ${b.x + nx * cut2} ${b.y + ny * cut2}`;
    }
  }
  return d;
}
