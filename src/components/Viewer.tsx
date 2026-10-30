"use client";

import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Analysis, Diagram } from "@/lib/types";
import { ArchitectureView } from "./diagram/ArchitectureView";
import { FileTreeView } from "./FileTreeView";
import { SidePanel } from "./SidePanel";
import { exportPdf, exportPng, exportSvg, exportText } from "@/lib/export";
import { toMermaid } from "@/lib/mermaid";
import { encodeDiagram } from "@/lib/shareCodec";
import { useTheme } from "./theme";

interface Props {
  diagram: Diagram;
  analysis?: Analysis | null;
  contents?: Map<string, string>;
  readOnly?: boolean;
  onChange?: (d: Diagram) => void;
  onRegenerate?: (instructions: string) => Promise<void>;
  onNew?: () => void;
  regenerating?: boolean;
}

export function Viewer(props: Props) {
  return (
    <ReactFlowProvider>
      <ViewerInner {...props} />
    </ReactFlowProvider>
  );
}

function ViewerInner({ diagram, analysis, contents, readOnly, onChange, onRegenerate, onNew, regenerating }: Props) {
  const rf = useReactFlow();
  const { dark, toggle: toggleTheme } = useTheme();
  const [view, setView] = useState<"arch" | "tree">("arch");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "export" | "groups" | "info" | "regen">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rating, setRating] = useState<null | "up" | "down">(null);
  const fileName = (diagram.title || "diagram").replace(/[^\w.-]+/g, "-");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const selectNode = (id: string | null) => {
    // collapsed groups map to their first member for details
    if (id?.startsWith("collapsed:")) {
      const gid = id.slice("collapsed:".length);
      id = diagram.nodes.find((n) => n.groupId === gid)?.id ?? null;
    }
    setSelectedNode(id);
    setSelectedFile(null);
    if (id) setPanelOpen(true);
  };

  const pickFile = (path: string | null) => {
    setSelectedFile(path);
    if (path) setPanelOpen(true);
  };

  const doExport = async (kind: "png" | "svg" | "pdf" | "mermaid" | "json") => {
    setMenu(null);
    try {
      if (kind === "mermaid") return exportText(toMermaid(diagram), `${fileName}.mmd`);
      if (kind === "json") return exportText(JSON.stringify(diagram, null, 2), `${fileName}.json`, "application/json");
      if (view !== "arch") {
        setView("arch");
        await new Promise((r) => setTimeout(r, 600));
      }
      const nodes = rf.getNodes();
      if (kind === "png") await exportPng(nodes, fileName);
      if (kind === "svg") await exportSvg(nodes, fileName);
      if (kind === "pdf") await exportPdf(nodes, fileName);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Export failed");
    }
  };

  const share = async () => {
    setMenu(null);
    try {
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ diagram }) });
      const j = await res.json().catch(() => ({}));
      let url: string;
      let note: string;
      if (res.ok) {
        url = `${location.origin}/share/${j.id}`;
        note = `expires ${new Date(j.expiresAt).toLocaleDateString()}`;
      } else if (j.fallback === "inline") {
        // No server storage: the link itself carries the (compressed) diagram.
        url = `${location.origin}/share/inline#${await encodeDiagram(diagram)}`;
        note = "the diagram is stored in the link itself";
      } else throw new Error(j.error ?? "Could not create link");
      await navigator.clipboard.writeText(url).catch(() => {});
      setToast(`View-only link copied (${note}).`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Share failed");
    }
  };

  const rate = (r: "up" | "down") => {
    setRating(r);
    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diagramId: diagram.id, rating: r, generatedBy: diagram.generatedBy, nodes: diagram.nodes.length }),
    }).catch(() => {});
    setToast("Thanks for the feedback!");
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Toolbar */}
      <header className="relative z-20 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        {onNew && (
          <button onClick={onNew} className="focus-ring mr-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-sm font-semibold hover:bg-surface-2" title="New upload">
            <Logo size={26} />
            <span className="hidden text-[15px] tracking-tight sm:inline">
              Code<span className="font-normal opacity-80">Atlas</span>
              <span className="hero-gradient font-extrabold">X</span>
            </span>
          </button>
        )}
        <span className="text-muted">/</span>
        <h1 className="max-w-[220px] truncate text-sm font-semibold" title={diagram.title}>
          {diagram.title}
        </h1>
        {diagram.source?.type === "github" && (
          <a
            href={diagram.source.subpath ? `${diagram.source.url}/tree/${diagram.source.ref}/${diagram.source.subpath}` : diagram.source.url}
            target="_blank"
            rel="noreferrer"
            className="focus-ring flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:text-foreground"
            title="Open repository on GitHub"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
            </svg>
            GitHub
          </a>
        )}
        {readOnly && <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">view only</span>}

        <div className="ml-2 flex rounded-md border border-line p-0.5 text-xs" role="tablist" aria-label="View">
          {(["arch", "tree"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`focus-ring rounded px-2.5 py-1 ${view === v ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
            >
              {v === "arch" ? "Architecture" : "File tree"}
            </button>
          ))}
        </div>

        <Search
          diagram={diagram}
          analysis={analysis}
          onPickNode={(id) => {
            setView("arch");
            selectNode(id);
            setFocusId(null);
            setTimeout(() => setFocusId(id), 0);
          }}
          onPickFile={(p) => {
            const owner = diagram.nodes.find((n) => n.files.includes(p));
            if (owner && view === "arch") {
              setSelectedNode(owner.id);
              setFocusId(null);
              setTimeout(() => setFocusId(owner.id), 0);
            } else setSelectedNode(null);
            pickFile(p);
          }}
        />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <ToolbarButton onClick={() => setMenu(menu === "info" ? null : "info")} active={menu === "info"}>
            Info
          </ToolbarButton>
          {view === "arch" && (
            <ToolbarButton onClick={() => setZoomEnabled((z) => !z)} active={zoomEnabled} title="Scroll-wheel zoom">
              {zoomEnabled ? "Zoom on" : "Enable zoom"}
            </ToolbarButton>
          )}
          {view === "arch" && diagram.groups.length > 0 && (
            <ToolbarButton onClick={() => setMenu(menu === "groups" ? null : "groups")} active={menu === "groups"}>
              Groups
            </ToolbarButton>
          )}
          {!readOnly && view === "arch" && Object.keys(diagram.positions ?? {}).length > 0 && (
            <ToolbarButton onClick={() => onChange?.({ ...diagram, positions: {}, layoutVersion: (diagram.layoutVersion ?? 0) + 1 })} title="Discard manual positions">
              Auto-layout
            </ToolbarButton>
          )}
          <ToolbarButton onClick={() => setMenu(menu === "export" ? null : "export")} active={menu === "export"}>
            Export ▾
          </ToolbarButton>
          {!readOnly && onRegenerate && (
            <ToolbarButton onClick={() => setMenu(menu === "regen" ? null : "regen")} active={menu === "regen"} primary>
              {regenerating ? "Regenerating…" : "Regenerate"}
            </ToolbarButton>
          )}
          <ToolbarButton onClick={toggleTheme} title="Toggle light / dark theme" aria-label="Toggle theme">
            {dark ? "☀" : "☾"}
          </ToolbarButton>
          {!panelOpen && <ToolbarButton onClick={() => setPanelOpen(true)}>Panel</ToolbarButton>}
        </div>

        {menu && (
          <div className="absolute right-3 top-full z-30 mt-1 w-80 rounded-lg border border-line bg-surface p-3 text-sm shadow-xl">
            {menu === "export" && (
              <div className="flex flex-col">
                {[
                  ["png", "PNG image"],
                  ["svg", "SVG vector"],
                  ["pdf", "PDF document"],
                  ["mermaid", "Mermaid source (.mmd)"],
                  ["json", "Diagram JSON"],
                ].map(([k, label]) => (
                  <button key={k} className="focus-ring rounded px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => doExport(k as "png")}>
                    {label}
                  </button>
                ))}
                {!readOnly && (
                  <>
                    <hr className="my-1 border-line" />
                    <button className="focus-ring rounded px-2 py-1.5 text-left hover:bg-surface-2" onClick={share}>
                      Copy private share link
                      <span className="block text-xs text-muted">View-only, expires after 30 days. Stores only the diagram JSON.</span>
                    </button>
                  </>
                )}
              </div>
            )}
            {menu === "groups" && (
              <div className="space-y-1">
                <p className="mb-1 text-xs text-muted">Show, hide or collapse groups.</p>
                {diagram.groups.map((g) => {
                  const hidden = diagram.hiddenGroups?.includes(g.id);
                  const collapsed = diagram.collapsedGroups?.includes(g.id);
                  const count = diagram.nodes.filter((n) => n.groupId === g.id).length;
                  return (
                    <div key={g.id} className="flex items-center gap-2">
                      <label className="flex flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          disabled={readOnly}
                          onChange={() =>
                            onChange?.({
                              ...diagram,
                              hiddenGroups: hidden ? diagram.hiddenGroups!.filter((x) => x !== g.id) : [...(diagram.hiddenGroups ?? []), g.id],
                            })
                          }
                        />
                        <span className="truncate">{g.label}</span>
                        <span className="text-xs text-muted">{count}</span>
                      </label>
                      {!readOnly && !hidden && (
                        <button
                          className="focus-ring rounded px-1.5 text-xs text-muted hover:bg-surface-2"
                          onClick={() =>
                            onChange?.({
                              ...diagram,
                              collapsedGroups: collapsed ? diagram.collapsedGroups!.filter((x) => x !== g.id) : [...(diagram.collapsedGroups ?? []), g.id],
                            })
                          }
                        >
                          {collapsed ? "Expand" : "Collapse"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {menu === "info" && <InfoBox diagram={diagram} analysis={analysis} />}
            {menu === "regen" && onRegenerate && (
              <RegenForm
                busy={!!regenerating}
                onSubmit={async (text) => {
                  setMenu(null);
                  await onRegenerate(text);
                }}
              />
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1" onClick={() => menu && setMenu(null)}>
        <main className="relative min-w-0 flex-1">
          {view === "arch" ? (
            <ArchitectureView
              diagram={diagram}
              onChange={onChange}
              readOnly={readOnly}
              selectedId={selectedNode}
              onSelect={selectNode}
              zoomEnabled={zoomEnabled}
              focusId={focusId}
              dark={dark}
            />
          ) : (
            <FileTreeView
              analysis={analysis ?? null}
              diagram={diagram}
              selectedFile={selectedFile}
              onSelectFile={(p) => {
                setSelectedNode(null);
                pickFile(p);
              }}
            />
          )}
          {view === "arch" && <Legend />}
          {regenerating && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
              <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow">Regenerating diagram…</div>
            </div>
          )}
          {!readOnly && (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs shadow-sm">
              <span className="text-muted">Is this diagram accurate?</span>
              <button aria-label="Yes, accurate" className={`focus-ring rounded px-1 ${rating === "up" ? "text-accent" : ""}`} onClick={() => rate("up")}>
                👍
              </button>
              <button aria-label="No, inaccurate" className={`focus-ring rounded px-1 ${rating === "down" ? "text-accent" : ""}`} onClick={() => rate("down")}>
                👎
              </button>
            </div>
          )}
        </main>
        {panelOpen && (
          <div className="w-[380px] shrink-0 max-md:hidden">
            <SidePanel
              diagram={diagram}
              analysis={analysis}
              contents={contents}
              selectedNodeId={selectedNode}
              selectedFile={selectedFile}
              onSelectNode={(id) => {
                selectNode(id);
                if (id && view === "arch") {
                  setFocusId(null);
                  setTimeout(() => setFocusId(id), 0);
                }
              }}
              onSelectFile={pickFile}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        )}
      </div>
      {toast && (
        <div role="status" className="fixed bottom-16 left-1/2 z-50 max-w-xl -translate-x-1/2 break-all rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/** CodeAtlasX mark: a flowchart (parent node branching into two children) on a gradient tile. */
export function Logo({ size = 24 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-bg`} x1="4" y1="2" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f7dfb" />
          <stop offset="0.5" stopColor="#7c4dff" />
          <stop offset="1" stopColor="#e2489a" />
        </linearGradient>
        <linearGradient id={`${id}-sh`} x1="20" y1="0" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id}-bg)`} />
      <rect width="40" height="40" rx="11" fill={`url(#${id}-sh)`} />
      <rect x="0.6" y="0.6" width="38.8" height="38.8" rx="10.4" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.2" />
      <path d="M20 15.5v5M11.5 25v-4.5h17V25" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12.5" y="8" width="15" height="8" rx="2.6" fill="#fff" />
      <circle cx="16.3" cy="12" r="1.5" fill="#7c4dff" />
      <rect x="5.5" y="24.5" width="12" height="8" rx="2.6" fill="#fff" />
      <rect x="22.5" y="24.5" width="12" height="8" rx="2.6" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

/** Logo + wordmark with the gradient "X". */
export function Brand({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`group flex items-center gap-3 ${className}`}>
      <span className="rounded-[11px] shadow-[0_8px_20px_-8px_rgba(124,77,255,0.7)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
        <Logo size={size} />
      </span>
      <span className="text-[19px] font-semibold tracking-[-0.03em]">
        Code<span className="font-normal opacity-80">Atlas</span>
        <span className="hero-gradient ml-px font-extrabold">X</span>
      </span>
    </span>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  primary,
  title,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      {...rest}
      className={`focus-ring rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        primary
          ? "border-transparent bg-accent text-white hover:opacity-90"
          : active
            ? "border-foreground/40 bg-surface-2"
            : "border-line hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function Search({
  diagram,
  analysis,
  onPickNode,
  onPickFile,
}: {
  diagram: Diagram;
  analysis?: Analysis | null;
  onPickNode: (id: string) => void;
  onPickFile: (p: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const files = useMemo(() => analysis?.files.map((f) => f.path) ?? [...new Set(diagram.nodes.flatMap((n) => n.files))], [analysis, diagram]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const nodes = diagram.nodes
      .filter((n) => n.label.toLowerCase().includes(s) || n.description.toLowerCase().includes(s))
      .slice(0, 6)
      .map((n) => ({ type: "node" as const, id: n.id, label: n.label, sub: n.primaryFile }));
    const fs = files
      .filter((f) => f.toLowerCase().includes(s))
      .sort((a, b) => (a.split("/").pop()!.toLowerCase().includes(s) ? 0 : 1) - (b.split("/").pop()!.toLowerCase().includes(s) ? 0 : 1))
      .slice(0, 8)
      .map((f) => ({ type: "file" as const, id: f, label: f.split("/").pop()!, sub: f }));
    return [...nodes, ...fs];
  }, [q, diagram, files]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const pick = (r: (typeof results)[number]) => {
    if (r.type === "node") onPickNode(r.id);
    else onPickFile(r.id);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative ml-2 w-56">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setIdx((i) => Math.min(i + 1, results.length - 1));
          if (e.key === "ArrowUp") setIdx((i) => Math.max(i - 1, 0));
          if (e.key === "Enter" && results[idx]) pick(results[idx]);
          if (e.key === "Escape") (e.target as HTMLInputElement).blur();
        }}
        placeholder="Search nodes or files  ⌘K"
        aria-label="Search nodes or files"
        className="focus-ring w-full rounded-md border border-line bg-background px-2.5 py-1 text-xs outline-none"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 top-full z-40 mt-1 max-h-80 w-80 overflow-y-auto rounded-lg border border-line bg-surface py-1 text-xs shadow-xl" role="listbox">
          {results.map((r, i) => (
            <li key={r.type + r.id} role="option" aria-selected={i === idx}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                className={`flex w-full flex-col px-3 py-1.5 text-left ${i === idx ? "bg-surface-2" : ""}`}
              >
                <span className="font-medium">
                  <span className="mr-1.5 text-[10px] uppercase text-muted">{r.type === "node" ? "node" : "file"}</span>
                  {r.label}
                </span>
                <span className="truncate font-mono text-[11px] text-muted">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RegenForm({ busy, onSubmit }: { busy: boolean; onSubmit: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(text);
      }}
      className="space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="block text-xs text-muted" htmlFor="regen">
        Instructions (optional)
      </label>
      <textarea
        id="regen"
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "split the API layer", "hide tests", "group by feature"'
        className="focus-ring w-full resize-none rounded border border-line bg-background p-2 text-sm outline-none"
      />
      <div className="flex flex-wrap gap-1">
        {["Split the API layer", "Hide tests", "Fewer, bigger components", "Show external services"].map((s) => (
          <button type="button" key={s} onClick={() => setText(s)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:bg-surface-2">
            {s}
          </button>
        ))}
      </div>
      <button disabled={busy} className="focus-ring w-full rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        Regenerate diagram
      </button>
    </form>
  );
}

function InfoBox({ diagram, analysis }: { diagram: Diagram; analysis?: Analysis | null }) {
  return (
    <div className="space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
      <p className="text-sm leading-relaxed">{diagram.summary}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted">Components</dt>
        <dd>{diagram.nodes.length}</dd>
        <dt className="text-muted">Relationships</dt>
        <dd>
          {diagram.edges.length} ({diagram.edges.filter((e) => e.basis === "detected").length} detected)
        </dd>
        {analysis && (
          <>
            <dt className="text-muted">Files uploaded</dt>
            <dd>{analysis.stats.totalFiles.toLocaleString()}</dd>
            <dt className="text-muted">Ignored</dt>
            <dd>{analysis.stats.ignoredFiles.toLocaleString()}</dd>
            <dt className="text-muted">Analysed</dt>
            <dd>
              {analysis.stats.analysedFiles.toLocaleString()} ({analysis.stats.totalLines.toLocaleString()} lines)
            </dd>
          </>
        )}
        <dt className="text-muted">Grouped by</dt>
        <dd>{diagram.generatedBy === "claude" ? "Claude (LLM)" : "Folder heuristics"}</dd>
        <dt className="text-muted">Generated</dt>
        <dd>{new Date(diagram.createdAt).toLocaleString()}</dd>
      </dl>
      {analysis && analysis.stack.length > 0 && (
        <div>
          <div className="mb-1 text-muted">Detected stack</div>
          <div className="flex flex-wrap gap-1">
            {analysis.stack.map((s) => (
              <span key={s.name} className="rounded bg-surface-2 px-1.5 py-0.5" title={`from ${s.source}`}>
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["actor", "Actor"],
    ["frontend", "Frontend"],
    ["feature", "Feature"],
    ["backend", "Backend"],
    ["persistence", "Persistence"],
    ["external", "External"],
  ];
  return (
    <details className="absolute left-3 top-3 z-10 rounded-lg border border-line bg-surface/95 px-3 py-2 text-[11px] shadow-sm" open>
      <summary className="cursor-pointer select-none font-medium text-muted">Legend</summary>
      <ul className="mt-1.5 space-y-1">
        {items.map(([k, l]) => (
          <li key={k} className="flex items-center gap-2">
            <span
              className={k === "actor" ? "h-3 w-3 rounded-full" : "h-3 w-4 rounded-sm"}
              style={{ background: `var(--k-${k}-bg)`, border: `1.5px ${k === "external" ? "dashed" : "solid"} var(--k-${k}-bd)` }}
            />
            {l}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <svg width="16" height="12" aria-hidden>
            <ellipse cx="8" cy="3" rx="6" ry="2" fill="var(--k-datastore-bg)" stroke="var(--k-datastore-bd)" />
            <path d="M2 3v6a6 2 0 0 0 12 0V3" fill="var(--k-datastore-bg)" stroke="var(--k-datastore-bd)" />
          </svg>
          Data store
        </li>
        <li className="flex items-center gap-2">
          <svg width="16" height="6" aria-hidden>
            <line x1="0" y1="3" x2="16" y2="3" stroke="var(--edge)" strokeWidth="1.5" />
          </svg>
          Sync call
        </li>
        <li className="flex items-center gap-2">
          <svg width="16" height="6" aria-hidden>
            <line x1="0" y1="3" x2="16" y2="3" stroke="var(--edge)" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          Async / network
        </li>
        <li className="flex items-center gap-2">
          <svg width="16" height="6" aria-hidden>
            <line x1="0" y1="3" x2="16" y2="3" stroke="var(--edge-inferred)" strokeWidth="1.5" />
          </svg>
          <i className="text-muted">Inferred</i>
        </li>
      </ul>
    </details>
  );
}
