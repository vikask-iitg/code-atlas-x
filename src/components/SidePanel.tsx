"use client";

import { useMemo } from "react";
import type { Analysis, Diagram, DiagramNode } from "@/lib/types";
import { CodePreview } from "./CodePreview";
import { LANG_COLORS, languageOf } from "@/lib/languages";
import { githubFileUrl, githubRawUrl } from "@/lib/github";

function GithubLink({ diagram, path, label }: { diagram: Diagram; path: string; label?: string }) {
  if (diagram.source?.type !== "github") return null;
  return (
    <a
      href={githubFileUrl(diagram.source, path)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="focus-ring shrink-0 text-muted hover:text-accent"
      title="Open on GitHub"
    >
      {label ?? "↗"}
    </a>
  );
}

const remoteFor = (d: Diagram, path: string) => (d.source?.type === "github" ? githubRawUrl(d.source, path) : undefined);

const KIND_LABEL: Record<string, string> = {
  actor: "Actor",
  frontend: "Frontend component",
  feature: "Feature module",
  backend: "Backend service",
  persistence: "Persistence / shared",
  datastore: "Data store",
  external: "External service",
};

interface Props {
  diagram: Diagram;
  analysis?: Analysis | null;
  contents?: Map<string, string>;
  selectedNodeId: string | null;
  selectedFile: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectFile: (path: string | null) => void;
  onClose: () => void;
}

export function SidePanel({ diagram, analysis, contents, selectedNodeId, selectedFile, onSelectNode, onSelectFile, onClose }: Props) {
  const node = diagram.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const fileInfo = useMemo(() => new Map(analysis?.files.map((f) => [f.path, f]) ?? []), [analysis]);

  return (
    <aside
      className="flex h-full w-full flex-col overflow-hidden border-l border-line bg-surface"
      aria-label={node ? `Details for ${node.label}` : "Diagram outline"}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="truncate text-sm font-semibold">{node ? node.label : selectedFile ? selectedFile.split("/").pop() : "Outline"}</h2>
        <div className="flex items-center gap-1">
          {(node || selectedFile) && (
            <button
              className="focus-ring rounded px-2 py-1 text-xs text-muted hover:bg-surface-2"
              onClick={() => {
                onSelectNode(null);
                onSelectFile(null);
              }}
            >
              Outline
            </button>
          )}
          <button className="focus-ring rounded px-2 py-1 text-muted hover:bg-surface-2" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {node ? (
          <NodeDetails
            node={node}
            diagram={diagram}
            fileInfo={fileInfo}
            contents={contents}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            onSelectNode={onSelectNode}
          />
        ) : selectedFile ? (
          <FileDetails path={selectedFile} diagram={diagram} contents={contents} fileInfo={fileInfo} onSelectNode={onSelectNode} />
        ) : (
          <Outline diagram={diagram} onSelectNode={onSelectNode} />
        )}
      </div>
    </aside>
  );
}

function NodeDetails({
  node,
  diagram,
  fileInfo,
  contents,
  selectedFile,
  onSelectFile,
  onSelectNode,
}: {
  node: DiagramNode;
  diagram: Diagram;
  fileInfo: Map<string, Analysis["files"][number]>;
  contents?: Map<string, string>;
  selectedFile: string | null;
  onSelectFile: (p: string | null) => void;
  onSelectNode: (id: string | null) => void;
}) {
  const nameOf = (id: string) => diagram.nodes.find((n) => n.id === id)?.label ?? id;
  const outgoing = diagram.edges.filter((e) => e.source === node.id);
  const incoming = diagram.edges.filter((e) => e.target === node.id);
  const group = diagram.groups.find((g) => g.id === node.groupId);
  const previewPath = selectedFile && node.files.includes(selectedFile) ? selectedFile : node.primaryFile;
  const lines = node.files.reduce((s, f) => s + (fileInfo.get(f)?.lines ?? 0), 0);

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full px-2 py-0.5" style={{ background: `var(--k-${node.kind}-bg)`, color: "var(--k-text)", border: `1px solid var(--k-${node.kind}-bd)` }}>
          {KIND_LABEL[node.kind]}
        </span>
        {group && <span className="text-muted">in {group.label}</span>}
      </div>
      <p className="leading-relaxed">{node.description}</p>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Relationships</h3>
        {outgoing.length + incoming.length === 0 && <p className="text-xs text-muted">No connections.</p>}
        <ul className="space-y-1 text-xs">
          {outgoing.map((e) => (
            <li key={e.id}>
              → <span className="text-muted">{e.label}</span>{" "}
              <button className="focus-ring text-accent hover:underline" onClick={() => onSelectNode(e.target)}>
                {nameOf(e.target)}
              </button>
              {e.basis === "inferred" && <span className="ml-1 italic text-muted">(inferred)</span>}
            </li>
          ))}
          {incoming.map((e) => (
            <li key={e.id}>
              ←{" "}
              <button className="focus-ring text-accent hover:underline" onClick={() => onSelectNode(e.source)}>
                {nameOf(e.source)}
              </button>{" "}
              <span className="text-muted">{e.label}</span>
              {e.basis === "inferred" && <span className="ml-1 italic text-muted">(inferred)</span>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Files ({node.files.length}
          {lines ? ` · ${lines.toLocaleString()} lines` : ""})
        </h3>
        <ul className="max-h-48 space-y-px overflow-y-auto rounded border border-line text-xs">
          {node.files.map((f) => (
            <li key={f} className="flex items-center pr-2">
              <button
                className={`focus-ring flex w-full items-center gap-2 px-2 py-1 text-left font-mono hover:bg-surface-2 ${f === previewPath ? "bg-surface-2 font-semibold" : ""}`}
                onClick={() => onSelectFile(f)}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LANG_COLORS[languageOf(f)] ?? LANG_COLORS.Other }} />
                <span className="truncate">{f}</span>
                {fileInfo.get(f) && <span className="ml-auto shrink-0 text-muted">{fileInfo.get(f)!.lines}</span>}
              </button>
              <GithubLink diagram={diagram} path={f} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="truncate font-mono text-xs text-muted">{previewPath}</h3>
          <span className="ml-auto text-xs">
            <GithubLink diagram={diagram} path={previewPath} label="Open on GitHub ↗" />
          </span>
        </div>
        <div className="overflow-hidden rounded border border-line bg-background">
          <CodePreview path={previewPath} content={contents?.get(previewPath)} remoteUrl={remoteFor(diagram, previewPath)} />
        </div>
      </section>
    </div>
  );
}

function FileDetails({
  path,
  diagram,
  contents,
  fileInfo,
  onSelectNode,
}: {
  path: string;
  diagram: Diagram;
  contents?: Map<string, string>;
  fileInfo: Map<string, Analysis["files"][number]>;
  onSelectNode: (id: string | null) => void;
}) {
  const owners = diagram.nodes.filter((n) => n.files.includes(path));
  const info = fileInfo.get(path);
  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="flex items-start gap-2">
        <div className="break-all font-mono text-xs text-muted">{path}</div>
        <span className="ml-auto text-xs">
          <GithubLink diagram={diagram} path={path} label="GitHub ↗" />
        </span>
      </div>
      {info && (
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          <span>{info.language}</span>
          <span>{info.lines.toLocaleString()} lines</span>
          <span>{(info.size / 1024).toFixed(1)} KB</span>
          {info.tags.filter((t) => t !== "test").length > 0 && <span>{info.tags.join(", ")}</span>}
        </div>
      )}
      {owners.length > 0 && (
        <p className="text-xs">
          Part of{" "}
          {owners.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ", "}
              <button className="focus-ring text-accent hover:underline" onClick={() => onSelectNode(o.id)}>
                {o.label}
              </button>
            </span>
          ))}
        </p>
      )}
      {info && info.imports.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Imports {info.imports.length} project files</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            {info.imports.map((i) => (
              <li key={i} className="truncate">
                {i}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="overflow-hidden rounded border border-line bg-background">
        <CodePreview path={path} content={contents?.get(path)} remoteUrl={remoteFor(diagram, path)} />
      </div>
    </div>
  );
}

/** Text alternative to the diagram (Accessibility NFR). */
function Outline({ diagram, onSelectNode }: { diagram: Diagram; onSelectNode: (id: string) => void }) {
  const nameOf = (id: string) => diagram.nodes.find((n) => n.id === id)?.label ?? id;
  const sections = [
    ...diagram.groups.map((g) => ({ key: g.id, title: g.label, nodes: diagram.nodes.filter((n) => n.groupId === g.id) })),
    { key: "_none", title: "Outside groups", nodes: diagram.nodes.filter((n) => !n.groupId || !diagram.groups.some((g) => g.id === n.groupId)) },
  ].filter((s) => s.nodes.length);
  return (
    <div className="space-y-4 p-4 text-sm">
      <p className="leading-relaxed">{diagram.summary}</p>
      {diagram.warnings && diagram.warnings.length > 0 && (
        <details className="rounded border border-line bg-surface-2 p-2 text-xs">
          <summary className="cursor-pointer text-muted">Notes from generation ({diagram.warnings.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {diagram.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {sections.map((s) => (
        <section key={s.key}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{s.title}</h3>
          <ul className="space-y-2">
            {s.nodes.map((n) => {
              const out = diagram.edges.filter((e) => e.source === n.id);
              return (
                <li key={n.id}>
                  <button className="focus-ring font-medium text-accent hover:underline" onClick={() => onSelectNode(n.id)}>
                    {n.label}
                  </button>{" "}
                  <span className="font-mono text-xs text-muted">[{n.primaryFile}]</span>
                  {out.length > 0 && (
                    <ul className="ml-3 text-xs text-muted">
                      {out.map((e) => (
                        <li key={e.id}>
                          {e.style === "async" ? "⇢" : "→"} {e.label} {nameOf(e.target)}
                          {e.basis === "inferred" ? " (inferred)" : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
