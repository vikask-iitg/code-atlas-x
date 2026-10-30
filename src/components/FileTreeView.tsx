"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { Analysis, Diagram, TreeNode } from "@/lib/types";
import { LANG_COLORS } from "@/lib/languages";

interface Props {
  analysis: Analysis | null;
  diagram: Diagram;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

/** Rebuild a tree from diagram file mappings (shared links have no analysis). */
function treeFromDiagram(d: Diagram): TreeNode {
  const root: TreeNode = { name: d.title, path: "", type: "dir", size: 0, lines: 0, fileCount: 0, children: [] };
  const files = [...new Set(d.nodes.flatMap((n) => n.files))];
  for (const f of files) {
    const parts = f.split("/");
    let cur = root;
    cur.fileCount++;
    cur.size++;
    for (let i = 0; i < parts.length; i++) {
      const p = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      let child = cur.children!.find((c) => c.name === parts[i]);
      if (!child) {
        child = isFile
          ? { name: parts[i], path: p, type: "file", size: 1, lines: 0, fileCount: 1 }
          : { name: parts[i], path: p, type: "dir", size: 0, lines: 0, fileCount: 0, children: [] };
        cur.children!.push(child);
      }
      if (!isFile) {
        child.fileCount++;
        child.size++;
      }
      cur = child;
    }
  }
  return root;
}

export function FileTreeView({ analysis, diagram, selectedFile, onSelectFile }: Props) {
  const tree = useMemo(() => analysis?.tree ?? treeFromDiagram(diagram), [analysis, diagram]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([""]));
  const [focusPath, setFocusPath] = useState("");
  const focusDir = useMemo(() => {
    let cur = tree;
    if (focusPath)
      for (const part of focusPath.split("/")) {
        const next = cur.children?.find((c) => c.name === part && c.type === "dir");
        if (!next) return tree;
        cur = next;
      }
    return cur;
  }, [tree, focusPath]);
  const setFocusDir = (n: TreeNode) => setFocusPath(n.path);

  const toggle = (p: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const langs = analysis?.languages ?? [];
  const totalLines = langs.reduce((s, l) => s + l.lines, 0) || 1;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-80 shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-3 py-2 text-xs text-muted">
          {tree.fileCount.toLocaleString()} files{analysis ? ` · ${analysis.stats.totalLines.toLocaleString()} lines` : ""}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1 text-[13px]" role="tree" aria-label="Project files">
          <TreeRows node={tree} depth={0} open={open} toggle={toggle} selectedFile={selectedFile} onSelectFile={onSelectFile} onFocusDir={setFocusDir} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {langs.length > 0 && (
          <div className="border-b border-line px-4 py-2">
            <div className="flex h-2 overflow-hidden rounded-full" aria-hidden>
              {langs.map((l) => (
                <div key={l.language} style={{ width: `${(l.lines / totalLines) * 100}%`, background: LANG_COLORS[l.language] ?? LANG_COLORS.Other }} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {langs.slice(0, 10).map((l) => (
                <span key={l.language} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: LANG_COLORS[l.language] ?? LANG_COLORS.Other }} />
                  {l.language} {((l.lines / totalLines) * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 px-4 py-2 text-xs text-muted">
          <span>Treemap:</span>
          <Breadcrumb root={tree} current={focusDir} onPick={setFocusDir} />
          <span className="ml-auto">sized by {analysis ? "lines" : "file count"}</span>
        </div>
        <div className="min-h-0 flex-1 px-4 pb-4">
          <Treemap node={focusDir} useLines={!!analysis} onFile={onSelectFile} onDir={setFocusDir} selectedFile={selectedFile} />
        </div>
      </div>
    </div>
  );
}

function Breadcrumb({ root, current, onPick }: { root: TreeNode; current: TreeNode; onPick: (n: TreeNode) => void }) {
  const chain: TreeNode[] = [root];
  if (current.path) {
    let cur = root;
    for (const part of current.path.split("/")) {
      const next = cur.children?.find((c) => c.name === part);
      if (!next) break;
      chain.push(next);
      cur = next;
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chain.map((n, i) => (
        <span key={n.path || "root"} className="flex items-center gap-1">
          {i > 0 && <span>/</span>}
          <button className="focus-ring hover:text-accent hover:underline" onClick={() => onPick(n)}>
            {n.name}
          </button>
        </span>
      ))}
    </span>
  );
}

function TreeRows({
  node,
  depth,
  open,
  toggle,
  selectedFile,
  onSelectFile,
  onFocusDir,
}: {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  toggle: (p: string) => void;
  selectedFile: string | null;
  onSelectFile: (p: string) => void;
  onFocusDir: (n: TreeNode) => void;
}) {
  return (
    <>
      {node.children?.map((c) =>
        c.type === "dir" ? (
          <div key={c.path} role="treeitem" aria-expanded={open.has(c.path)} aria-selected={false}>
            <button
              className="focus-ring flex w-full items-center gap-1.5 py-0.5 pr-2 text-left hover:bg-surface-2"
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => {
                toggle(c.path);
                onFocusDir(c);
              }}
            >
              <span className="w-3 text-[10px] text-muted">{open.has(c.path) ? "▾" : "▸"}</span>
              <span className="truncate font-medium">{c.name}</span>
              <span className="ml-auto text-[11px] text-muted">{c.fileCount}</span>
            </button>
            {open.has(c.path) && (
              <div role="group">
                <TreeRows node={c} depth={depth + 1} open={open} toggle={toggle} selectedFile={selectedFile} onSelectFile={onSelectFile} onFocusDir={onFocusDir} />
              </div>
            )}
          </div>
        ) : (
          <button
            key={c.path}
            role="treeitem"
            aria-selected={selectedFile === c.path}
            className={`focus-ring flex w-full items-center gap-1.5 py-0.5 pr-2 text-left hover:bg-surface-2 ${selectedFile === c.path ? "bg-surface-2 text-accent" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 + 16 }}
            onClick={() => onSelectFile(c.path)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LANG_COLORS[c.language ?? "Other"] ?? LANG_COLORS.Other }} />
            <span className="truncate">{c.name}</span>
            {c.lines > 0 && <span className="ml-auto text-[11px] text-muted">{c.lines}</span>}
          </button>
        ),
      )}
    </>
  );
}

// ---------- squarified treemap ----------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Placed extends Rect {
  node: TreeNode;
}

function squarify(items: { node: TreeNode; value: number }[], rect: Rect): Placed[] {
  const out: Placed[] = [];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total || rect.w <= 0 || rect.h <= 0) return out;
  const scale = (rect.w * rect.h) / total;
  const queue = items.map((i) => ({ node: i.node, area: i.value * scale })).sort((a, b) => b.area - a.area);
  let { x, y, w, h } = rect;
  while (queue.length) {
    const short = Math.min(w, h);
    const row: typeof queue = [];
    let best = Infinity;
    while (queue.length) {
      const cand = [...row, queue[0]];
      const s = cand.reduce((a, c) => a + c.area, 0);
      const max = Math.max(...cand.map((c) => c.area));
      const min = Math.min(...cand.map((c) => c.area));
      const worst = Math.max((short * short * max) / (s * s), (s * s) / (short * short * min));
      if (worst > best) break;
      best = worst;
      row.push(queue.shift()!);
    }
    const s = row.reduce((a, c) => a + c.area, 0);
    const thick = s / short;
    let off = 0;
    for (const r of row) {
      const len = r.area / thick;
      if (w >= h) out.push({ node: r.node, x, y: y + off, w: thick, h: len });
      else out.push({ node: r.node, x: x + off, y, w: len, h: thick });
      off += len;
    }
    if (w >= h) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
  }
  return out;
}

function dominantLang(n: TreeNode): string {
  if (n.type === "file") return n.language ?? "Other";
  const counts = new Map<string, number>();
  const walk = (t: TreeNode) => {
    if (t.type === "file") counts.set(t.language ?? "Other", (counts.get(t.language ?? "Other") ?? 0) + Math.max(1, t.lines));
    t.children?.forEach(walk);
  };
  walk(n);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Other";
}

function Treemap({
  node,
  useLines,
  onFile,
  onDir,
  selectedFile,
}: {
  node: TreeNode;
  useLines: boolean;
  onFile: (p: string) => void;
  onDir: (n: TreeNode) => void;
  selectedFile: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const value = (n: TreeNode) => Math.max(1, useLines ? n.lines : n.fileCount);
  const placed = useMemo(() => {
    const items = (node.children ?? []).map((c) => ({ node: c, value: value(c) }));
    const top = squarify(items, { x: 0, y: 0, w: size.w, h: size.h });
    // second level inside directories
    const inner: Placed[] = [];
    for (const p of top) {
      if (p.node.type === "dir" && p.w > 60 && p.h > 50) {
        const kids = (p.node.children ?? []).map((c) => ({ node: c, value: value(c) }));
        inner.push(...squarify(kids, { x: p.x + 3, y: p.y + 20, w: p.w - 6, h: p.h - 23 }));
      }
    }
    return { top, inner };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, size, useLines]);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden rounded-lg border border-line bg-surface">
      {placed.top.map((p) => {
        const color = LANG_COLORS[dominantLang(p.node)] ?? LANG_COLORS.Other;
        const isDir = p.node.type === "dir";
        return (
          <button
            key={p.node.path}
            className="focus-ring absolute overflow-hidden border border-white/70 text-left text-[11px] dark:border-black/50"
            style={{
              left: p.x,
              top: p.y,
              width: p.w,
              height: p.h,
              background: isDir ? `color-mix(in srgb, ${color} 18%, var(--surface))` : `color-mix(in srgb, ${color} 70%, var(--surface))`,
              outline: selectedFile === p.node.path ? "2px solid var(--accent)" : undefined,
            }}
            title={`${p.node.path} — ${p.node.fileCount} files, ${p.node.lines.toLocaleString()} lines`}
            onClick={() => (isDir ? onDir(p.node) : onFile(p.node.path))}
          >
            {p.w > 40 && p.h > 16 && (
              <span className={`block truncate px-1.5 pt-0.5 font-medium ${isDir ? "" : "text-white"}`}>
                {p.node.name}
                {isDir ? "/" : ""}
              </span>
            )}
          </button>
        );
      })}
      {placed.inner.map((p) => {
        const color = LANG_COLORS[dominantLang(p.node)] ?? LANG_COLORS.Other;
        return (
          <button
            key={"i:" + p.node.path}
            className="focus-ring absolute overflow-hidden border border-white/60 text-left text-[10px] text-white dark:border-black/40"
            style={{
              left: p.x,
              top: p.y,
              width: p.w,
              height: p.h,
              background: `color-mix(in srgb, ${color} ${p.node.type === "dir" ? 55 : 75}%, var(--surface))`,
              outline: selectedFile === p.node.path ? "2px solid var(--accent)" : undefined,
            }}
            title={`${p.node.path} — ${p.node.lines.toLocaleString()} lines`}
            onClick={() => (p.node.type === "dir" ? onDir(p.node) : onFile(p.node.path))}
          >
            {p.w > 44 && p.h > 14 && <span className="block truncate px-1 pt-px">{p.node.name}</span>}
          </button>
        );
      })}
    </div>
  );
}
