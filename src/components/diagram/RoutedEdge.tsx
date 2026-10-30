"use client";

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { routedPath, type Jump, type Pt } from "@/lib/layout";

export type RoutedEdgeData = {
  label: string;
  style: "sync" | "async";
  basis: "detected" | "inferred";
  points?: Pt[];
  labelPos?: Pt;
  jumps?: Jump[];
  highlighted?: boolean;
};
export type RoutedEdgeT = Edge<RoutedEdgeData, "routed">;

/**
 * Orthogonal edge using ELK's route (with line-jump arcs where edges cross). If a user has
 * dragged one of its endpoints, it falls back to a smooth-step path between the handles.
 */
export const RoutedEdge = memo(function RoutedEdge(props: EdgeProps<RoutedEdgeT>) {
  const { id, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props;
  let path: string;
  let lx: number;
  let ly: number;
  if (data?.points && data.points.length >= 2) {
    path = routedPath(data.points, data.jumps);
    const mid = data.labelPos ?? data.points[Math.floor(data.points.length / 2)];
    lx = mid.x;
    ly = mid.y;
  } else {
    const [p, x, y] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
    path = p;
    lx = x;
    ly = y;
  }
  const inferred = data?.basis === "inferred";
  const color = data?.highlighted ? "var(--accent)" : inferred ? "var(--edge-inferred)" : "var(--edge)";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={14}
        style={{
          stroke: color,
          strokeWidth: data?.highlighted ? 2.4 : 1.6,
          strokeDasharray: data?.style === "async" ? "6 5" : undefined,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded px-1.5 py-px text-[11px] leading-4"
            style={{
              transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`,
              background: "var(--edge-label-bg)",
              color: data.highlighted ? "var(--accent)" : inferred ? "var(--muted)" : "var(--foreground)",
              fontStyle: inferred ? "italic" : undefined,
              border: data.highlighted ? "1px solid var(--accent)" : "1px solid transparent",
            }}
            title={inferred ? "Inferred relationship (not confirmed by the import graph)" : "Detected from imports"}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes = { routed: RoutedEdge };
