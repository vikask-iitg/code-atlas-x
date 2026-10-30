"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Diagram } from "@/lib/types";
import { computeJumps, layoutDiagram, type LaidOut } from "@/lib/layout";
import { nodeTypes, type ArchNodeData, type GroupNodeData } from "./nodes";
import { edgeTypes, type RoutedEdgeT } from "./RoutedEdge";

interface Props {
  diagram: Diagram;
  onChange?: (d: Diagram) => void;
  readOnly?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  zoomEnabled: boolean;
  focusId: string | null;
  dark: boolean;
}

export function ArchitectureView({ diagram, onChange, readOnly, selectedId, onSelect, zoomEnabled, focusId, dark }: Props) {
  const rf = useReactFlow();
  const [laid, setLaid] = useState<LaidOut | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [baseEdges, setBaseEdges] = useEdgesState<RoutedEdgeT>([]);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const pendingFit = useRef(false);
  const initialized = useNodesInitialized();

  // Fit once nodes are measured after each (re)layout.
  useEffect(() => {
    if (initialized && pendingFit.current && nodes.length) {
      pendingFit.current = false;
      requestAnimationFrame(() => rf.fitView({ padding: 0.06, duration: 200 }));
    }
  }, [initialized, nodes, rf]);

  // Re-run ELK only when structure changes (not when nodes are merely dragged).
  const layoutKey = useMemo(
    () =>
      JSON.stringify({
        n: diagram.nodes.map((n) => [n.id, n.label, n.groupId, n.kind]),
        g: diagram.groups.map((g) => [g.id, g.label]),
        e: diagram.edges.map((e) => [e.source, e.target, e.label]),
        h: diagram.hiddenGroups,
        c: diagram.collapsedGroups,
        v: diagram.layoutVersion ?? 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diagram.id, diagram.nodes, diagram.groups, diagram.edges, diagram.hiddenGroups, diagram.collapsedGroups, diagram.layoutVersion],
  );

  useEffect(() => {
    let cancelled = false;
    layoutDiagram(diagram).then((l) => !cancelled && setLaid(l));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  const update = useCallback((fn: (d: Diagram) => Diagram) => onChange?.(fn(diagram)), [diagram, onChange]);

  const onRename = useCallback(
    (id: string, label: string) =>
      update((d) => ({
        ...d,
        nodes: d.nodes.map((n) => (n.id === id ? { ...n, label } : n)),
        groups: d.groups.map((g) => (`collapsed:${g.id}` === id ? { ...g, label } : g)),
      })),
    [update],
  );
  const onCollapse = useCallback(
    (gid: string) => update((d) => ({ ...d, collapsedGroups: [...new Set([...(d.collapsedGroups ?? []), gid])] })),
    [update],
  );
  const onExpand = useCallback(
    (gid: string) => update((d) => ({ ...d, collapsedGroups: (d.collapsedGroups ?? []).filter((g) => g !== gid) })),
    [update],
  );

  // Build React Flow nodes from the layout (+ saved manual positions).
  useEffect(() => {
    if (!laid) return;
    const saved = diagram.positions ?? {};
    const groupAbs = new Map(laid.groups.map((g) => [g.id, g]));
    const rfNodes: Node[] = [
      ...laid.groups.map(
        (g): Node<GroupNodeData> => ({
          id: g.id,
          type: "groupBox",
          position: saved[g.id] ?? { x: g.x, y: g.y },
          style: { width: g.width, height: g.height },
          data: { label: g.label, description: g.description, onCollapse, readOnly },
          draggable: !readOnly,
          selectable: false,
          zIndex: -1,
        }),
      ),
      ...laid.nodes.map((n): Node<ArchNodeData> => {
        const parent = n.groupId ? groupAbs.get(n.groupId) : undefined;
        const pos = saved[n.id] ?? (parent ? { x: n.x - parent.x, y: n.y - parent.y } : { x: n.x, y: n.y });
        return {
          id: n.id,
          type: "arch",
          position: pos,
          parentId: parent ? parent.id : undefined,
          expandParent: true,
          data: { ...n, onRename, onExpand, readOnly },
          draggable: !readOnly,
          width: n.width,
          height: n.height,
        };
      }),
    ];
    setNodes(rfNodes);
    pendingFit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laid]);

  // Keep callbacks fresh without re-layout.
  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) =>
        n.type === "groupBox"
          ? { ...n, data: { ...n.data, onCollapse, readOnly } }
          : { ...n, data: { ...n.data, onRename, onExpand, readOnly } },
      ),
    );
  }, [onCollapse, onRename, onExpand, readOnly, setNodes]);

  // Edges: use ELK routes unless an endpoint (or its group) was moved by hand.
  useEffect(() => {
    if (!laid) return;
    const saved = diagram.positions ?? {};
    const moved = new Set(Object.keys(saved));
    for (const n of laid.nodes) if (n.groupId && moved.has(n.groupId)) moved.add(n.id);
    const routed = laid.edges.map((e) => ({ id: e.id, points: moved.has(e.source) || moved.has(e.target) ? undefined : e.points }));
    const jumps = computeJumps(routed);
    setBaseEdges(
      laid.edges.map((e, i) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "routed",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: e.basis === "inferred" ? "var(--edge-inferred)" : "var(--edge)" },
        data: {
          label: e.label,
          style: e.style,
          basis: e.basis,
          points: routed[i].points,
          labelPos: routed[i].points ? e.labelPos : undefined,
          jumps: jumps.get(e.id),
        },
      })),
    );
  }, [laid, diagram.positions, setBaseEdges]);

  // Hover highlighting (D5)
  const { litNodes, litEdges } = useMemo(() => {
    const litNodes = new Set<string>();
    const litEdges = new Set<string>();
    if (hoverNode) {
      litNodes.add(hoverNode);
      for (const e of baseEdges)
        if (e.source === hoverNode || e.target === hoverNode) {
          litEdges.add(e.id);
          litNodes.add(e.source);
          litNodes.add(e.target);
        }
    } else if (hoverEdge) {
      const e = baseEdges.find((x) => x.id === hoverEdge);
      if (e) {
        litEdges.add(e.id);
        litNodes.add(e.source);
        litNodes.add(e.target);
      }
    }
    return { litNodes, litEdges };
  }, [hoverNode, hoverEdge, baseEdges]);
  const active = litNodes.size > 0;

  // Hover card content (what the box is for and how it connects)
  const hoverInfo = useMemo(() => {
    if (!hoverNode) return null;
    const label = (id: string) => (nodes.find((n) => n.id === id)?.data as ArchNodeData | undefined)?.label ?? id;
    const group = laid?.groups.find((g) => g.id === (nodes.find((n) => n.id === hoverNode)?.data as ArchNodeData | undefined)?.groupId);
    return {
      group: group?.label,
      connections: baseEdges
        .filter((e) => e.source === hoverNode || e.target === hoverNode)
        .map((e) => ({
          dir: e.source === hoverNode ? ("out" as const) : ("in" as const),
          label: e.data?.label ?? "",
          other: label(e.source === hoverNode ? e.target : e.source),
          inferred: e.data?.basis === "inferred",
        })),
    };
  }, [hoverNode, baseEdges, nodes, laid]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedId,
        className: active && n.type !== "groupBox" && !litNodes.has(n.id) ? "dimmed" : undefined,
        ...(n.id === hoverNode && hoverInfo ? { data: { ...n.data, hover: hoverInfo }, zIndex: 1000 } : {}),
      })),
    [nodes, selectedId, active, litNodes, hoverNode, hoverInfo],
  );
  const displayEdges = useMemo(
    () =>
      baseEdges.map((e) => ({
        ...e,
        className: active && !litEdges.has(e.id) ? "dimmed" : undefined,
        data: { ...e.data!, highlighted: litEdges.has(e.id) },
        zIndex: litEdges.has(e.id) ? 5 : 0,
      })),
    [baseEdges, active, litEdges],
  );

  useEffect(() => {
    if (focusId) rf.fitView({ nodes: [{ id: focusId }], duration: 400, maxZoom: 1.3, padding: 0.6 });
  }, [focusId, rf]);

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      colorMode={dark ? "dark" : "light"}
      onNodeClick={(_, n) => n.type === "arch" && onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      onNodeMouseEnter={(_, n) => n.type === "arch" && setHoverNode(n.id)}
      onNodeMouseLeave={() => setHoverNode(null)}
      onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)}
      onEdgeMouseLeave={() => setHoverEdge(null)}
      onNodeDragStop={(_, __, dragged) => {
        if (readOnly) return;
        const next = { ...(diagram.positions ?? {}) };
        for (const n of dragged) next[n.id] = n.position;
        onChange?.({ ...diagram, positions: next });
      }}
      nodesConnectable={false}
      elementsSelectable
      zoomOnScroll={zoomEnabled}
      zoomOnPinch
      panOnScroll={!zoomEnabled}
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={dark ? "#333" : "#d6d4cd"} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.type === "groupBox" ? "transparent" : `var(--k-${(n.data as ArchNodeData).kind}-bd)`)}
        nodeStrokeColor={(n) => (n.type === "groupBox" ? "var(--group-bd)" : "transparent")}
        maskColor={dark ? "rgba(0,0,0,0.55)" : "rgba(240,240,236,0.65)"}
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
