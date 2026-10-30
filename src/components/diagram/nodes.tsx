"use client";

import { Handle, NodeToolbar, Position, type NodeProps, type Node } from "@xyflow/react";
import { memo, useState } from "react";
import type { VisibleNode } from "@/lib/layout";

export type ArchNodeData = VisibleNode & {
  onRename?: (id: string, label: string) => void;
  onExpand?: (groupId: string) => void;
  readOnly?: boolean;
  hover?: HoverInfo;
};
export type HoverInfo = {
  group?: string;
  connections: { dir: "in" | "out"; label: string; other: string; inferred: boolean }[];
};
export type ArchNode = Node<ArchNodeData, "arch">;

export type GroupNodeData = {
  label: string;
  description?: string;
  onCollapse?: (id: string) => void;
  readOnly?: boolean;
};
export type GroupNode = Node<GroupNodeData, "groupBox">;

const KIND_INFO: Record<string, { title: string; why: string }> = {
  actor: { title: "Actor", why: "Someone or something outside the code that starts the system." },
  frontend: { title: "Frontend component", why: "User-facing UI: routing, layout or shared components." },
  feature: { title: "Feature module", why: "A self-contained feature or editor screen in the UI." },
  backend: { title: "Backend service", why: "Server-side logic: APIs, workers, pipelines or agents." },
  persistence: { title: "Persistence / shared", why: "Code that stores, loads or shares data." },
  datastore: { title: "Data store", why: "Where the application keeps its data." },
  external: { title: "External service", why: "A third-party API or service the code depends on." },
  collapsed: { title: "Collapsed group", why: "Several components folded together to keep the diagram readable." },
};

/** Hover card explaining what a box is for and why it exists. */
function HoverCard({ data }: { data: ArchNodeData }) {
  const info = KIND_INFO[data.kind] ?? KIND_INFO.backend;
  const h = data.hover;
  const out = h?.connections.filter((c) => c.dir === "out") ?? [];
  const inc = h?.connections.filter((c) => c.dir === "in") ?? [];
  const MAX = 4;
  return (
    <NodeToolbar isVisible={!!h} position={data.kind === "actor" ? Position.Bottom : Position.Top} offset={12}>
      <div
        role="tooltip"
        className="pointer-events-none w-[300px] rounded-xl border border-line bg-surface/95 p-3.5 text-left text-xs leading-relaxed text-foreground shadow-[0_16px_40px_-12px_rgba(20,25,40,0.35)] backdrop-blur-md"
      >
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: `var(--k-${data.kind}-bg)`, border: `1.5px solid var(--k-${data.kind}-bd)` }} />
          <span className="font-semibold">{data.label}</span>
          <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted">{info.title}</span>
        </div>
        {h?.group && <div className="mt-0.5 text-[11px] text-muted">in {h.group}</div>}

        <p className="mt-2 text-[12.5px]">{data.description || info.why}</p>
        {data.description && <p className="mt-1.5 text-[11px] italic text-muted">{info.why}</p>}

        {(out.length > 0 || inc.length > 0) && (
          <div className="mt-2.5 space-y-0.5 border-t border-line pt-2 text-[11px]">
            {out.slice(0, MAX).map((c, i) => (
              <div key={"o" + i} className={c.inferred ? "text-muted" : ""}>
                <span className="text-muted">→</span> {c.label} <span className="font-medium">{c.other}</span>
              </div>
            ))}
            {inc.slice(0, MAX).map((c, i) => (
              <div key={"i" + i} className={c.inferred ? "text-muted" : ""}>
                <span className="text-muted">←</span> <span className="font-medium">{c.other}</span> {c.label}
              </div>
            ))}
            {out.length + inc.length > MAX * 2 && <div className="text-muted">+{out.length + inc.length - MAX * 2} more</div>}
          </div>
        )}

        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2 text-[11px] text-muted">
          <span className="truncate font-mono">
            {data.files.length} file{data.files.length === 1 ? "" : "s"} · {data.primaryFile.split("/").pop()}
          </span>
          <span className="shrink-0">Click for details</span>
        </div>
      </div>
    </NodeToolbar>
  );
}

const Handles = () => (
  <>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </>
);

function EditableLabel({ id, label, onRename, readOnly }: { id: string; label: string; onRename?: ArchNodeData["onRename"]; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Rename node"
        className="nodrag w-full rounded bg-white/80 px-1 text-center text-[13px] font-semibold text-black outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (value.trim() && value !== label) onRename?.(id, value.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setValue(label);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <div
      className="truncate text-[13px] font-semibold leading-tight"
      title={readOnly ? label : `${label} — double-click to rename`}
      onDoubleClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        setValue(label);
        setEditing(true);
      }}
    >
      {label}
    </div>
  );
}

const baseName = (p: string) => p.split("/").pop() ?? p;

export const ArchNodeView = memo(function ArchNodeView({ id, data, selected }: NodeProps<ArchNode>) {
  const k = data.kind;
  const style = {
    width: data.width,
    height: data.height,
    color: "var(--k-text)",
  } as const;
  const ring = selected ? "0 0 0 3px var(--accent)" : undefined;

  if (k === "actor") {
    return (
      <div
        style={{ ...style, background: `var(--k-actor-bg)`, border: `2px solid var(--k-actor-bd)`, boxShadow: ring }}
        className="flex flex-col items-center justify-center rounded-full px-3 text-center"
      >
        <Handles />
        <HoverCard data={data} />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-0.5 opacity-70" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        <EditableLabel id={id} label={data.label} onRename={data.onRename} readOnly={data.readOnly} />
      </div>
    );
  }

  if (k === "datastore") {
    const w = data.width;
    const h = data.height;
    const ry = 10;
    return (
      <div style={{ ...style, filter: selected ? "drop-shadow(0 0 3px var(--accent))" : undefined }} className="relative">
        <Handles />
        <HoverCard data={data} />
        <svg width={w} height={h} className="absolute inset-0" aria-hidden>
          <path
            d={`M1 ${ry} A ${w / 2 - 1} ${ry} 0 0 1 ${w - 1} ${ry} L ${w - 1} ${h - ry} A ${w / 2 - 1} ${ry} 0 0 1 1 ${h - ry} Z`}
            fill="var(--k-datastore-bg)"
            stroke="var(--k-datastore-bd)"
            strokeWidth="2"
          />
          <path d={`M1 ${ry} A ${w / 2 - 1} ${ry} 0 0 0 ${w - 1} ${ry}`} fill="none" stroke="var(--k-datastore-bd)" strokeWidth="2" />
        </svg>
        <div className="relative flex h-full flex-col items-center justify-center px-3 pt-3 text-center">
          <EditableLabel id={id} label={data.label} onRename={data.onRename} readOnly={data.readOnly} />
        </div>
      </div>
    );
  }

  if (k === "collapsed") {
    return (
      <div
        style={{ ...style, background: "var(--k-collapsed-bg)", border: "2px solid var(--k-collapsed-bd)", boxShadow: `4px 4px 0 -1px var(--k-collapsed-bg), 4px 4px 0 1px var(--k-collapsed-bd)${ring ? ", " + ring : ""}` }}
        className="flex flex-col items-center justify-center rounded-md px-3 text-center"
      >
        <Handles />
        <HoverCard data={data} />
        <div className="truncate text-[13px] font-semibold">{data.label}</div>
        <button
          className="nodrag mt-1 rounded border border-current/30 px-2 text-[11px] opacity-80 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            data.onExpand?.(id.replace(/^collapsed:/, ""));
          }}
        >
          ⊕ Expand {data.memberCount} components
        </button>
      </div>
    );
  }

  const dashed = k === "external";
  return (
    <div
      style={{
        ...style,
        background: `var(--k-${k}-bg)`,
        border: `2px ${dashed ? "dashed" : "solid"} var(--k-${k}-bd)`,
        boxShadow: ring,
      }}
      className="flex flex-col items-center justify-center rounded-md px-3 text-center"
    >
      <Handles />
      <HoverCard data={data} />
      <EditableLabel id={id} label={data.label} onRename={data.onRename} readOnly={data.readOnly} />
      <div className="mt-0.5 max-w-full truncate font-mono text-[11px] opacity-75">[{baseName(data.primaryFile)}]</div>
    </div>
  );
});

export const GroupBoxView = memo(function GroupBoxView({ id, data }: NodeProps<GroupNode>) {
  return (
    <div
      className="h-full w-full rounded-xl"
      style={{ background: "var(--group-bg)", border: "1.5px solid var(--group-bd)" }}
    >
      <div className="group-title flex items-center gap-2 px-4 pt-3 text-[13px] font-semibold text-muted" title={data.description}>
        <span>{data.label}</span>
        {!data.readOnly && (
          <button
            className="nodrag rounded px-1 text-[11px] font-normal opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            onClick={() => data.onCollapse?.(id)}
            title="Collapse group"
            aria-label={`Collapse ${data.label}`}
          >
            ⊖
          </button>
        )}
      </div>
    </div>
  );
});

export const nodeTypes = { arch: ArchNodeView, groupBox: GroupBoxView };
