"use client";

import { useCallback, useEffect, useState } from "react";
import type { Analysis, Diagram, DiagramSource, ScanResult } from "@/lib/types";
import { parseGithubUrl } from "@/lib/github";
import { LIMITS, UploadError, filesFromDataTransfer, readFileList, readZip, scan } from "@/lib/ingest";
import { DEFAULT_RULES, REASON_LABELS } from "@/lib/ignore";
import { analyse, isSourceFile } from "@/lib/analyze";
import { buildPayload } from "@/lib/payload";
import { sampleEntries } from "@/lib/sample";
import { Viewer, Brand } from "./Viewer";
import { Landing } from "./Landing";
import { useTheme } from "./theme";

type Collected = Awaited<ReturnType<typeof readZip>>;
type Phase =
  | { kind: "landing" }
  | { kind: "reading"; label: string }
  | { kind: "scan"; scan: ScanResult; collected: Collected }
  | { kind: "analysing"; stage: number; done: number; total: number; startedAt: number }
  | { kind: "view" }
  | { kind: "error"; message: string; detail?: string };

const STAGES = ["Extracting", "Filtering", "Parsing imports", "Grouping components", "Drawing"];
const LAST_KEY = "cv:last";
const now = () => Date.now();

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ kind: "landing" });
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [lastSaved, setLastSaved] = useState<Diagram | null>(null);
  const [contents, setContents] = useState(() => new Map<string, string>());
  const [source, setSource] = useState<DiagramSource | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      if (raw) setLastSaved(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Persist edits (D7: layout persists)
  const saveDiagram = useCallback((d: Diagram) => {
    setDiagram(d);
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(d));
    } catch {
      /* quota */
    }
  }, []);

  const startScan = async (collected: Collected) => {
    setPhase({ kind: "reading", label: "Scanning files…" });
    const s = await scan(collected, DEFAULT_RULES);
    setPhase({ kind: "scan", scan: s, collected });
  };

  const handleFiles = async (files: File[]) => {
    try {
      if (!files.length) return;
      setSource(undefined);
      if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
        setPhase({ kind: "reading", label: `Reading ${files[0].name}…` });
        await startScan(await readZip(files[0]));
      } else if (files.length === 1 && /\.(tar|tgz|gz|7z|rar)$/i.test(files[0].name)) {
        throw new UploadError(`${files[0].name} isn't supported yet.`, "Upload a .zip, a folder, or individual source files. (.tar.gz and .7z support is planned.)");
      } else {
        setPhase({ kind: "reading", label: `Reading ${files.length} files…` });
        await startScan(readFileList(files));
      }
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof UploadError ? e.message : "We couldn't read this upload.",
        detail: e instanceof UploadError ? e.detail : e instanceof Error ? e.message : undefined,
      });
    }
  };

  /** GitHub URL import (E5): download the archive through our proxy, then treat it like a .zip. */
  const handleGithub = async (url: string) => {
    const gh = parseGithubUrl(url);
    if (!gh) {
      setPhase({
        kind: "error",
        message: "That doesn't look like a GitHub repository URL.",
        detail: "Use a link like https://github.com/owner/repo, or …/tree/branch/folder to analyse one folder.",
      });
      return;
    }
    const name = `${gh.owner}/${gh.repo}`;
    try {
      setPhase({ kind: "reading", label: `Downloading ${name} from GitHub…` });
      const res = await fetch(`/api/github?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new UploadError(j.error ?? `GitHub download failed (HTTP ${res.status}).`, j.detail);
      }
      // Stream with progress
      const reader = res.body!.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        setPhase({ kind: "reading", label: `Downloading ${name} from GitHub… ${(received / 1024 / 1024).toFixed(1)} MB` });
      }
      setPhase({ kind: "reading", label: `Unpacking ${name}…` });
      const zipped = await readZip(new File(chunks, `${gh.repo}.zip`, { type: "application/zip" }));

      // GitHub archives wrap everything in one folder: "owner-repo-<sha>" or "repo-<ref>".
      const root = zipped.entries[0]?.path.split("/")[0] ?? "";
      const sha = root.match(/-([0-9a-f]{7,40})$/)?.[1];
      const prefix = `${root}/${gh.subpath ? gh.subpath.replace(/\/+$/, "") + "/" : ""}`;
      const entries = zipped.entries.filter((e) => e.path.startsWith(prefix)).map((e) => ({ ...e, path: e.path.slice(prefix.length) }));
      if (!entries.length) throw new UploadError(`The folder "${gh.subpath}" wasn't found in ${name}.`, "Check the path in the URL.");

      setSource({ type: "github", owner: gh.owner, repo: gh.repo, ref: gh.ref ?? sha ?? "HEAD", subpath: gh.subpath, url: `https://github.com/${name}` });
      await startScan({ name: gh.subpath ? `${name}/${gh.subpath}` : name, entries, rejected: zipped.rejected });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof UploadError ? e.message : `We couldn't import ${name}.`,
        detail: e instanceof UploadError ? e.detail : e instanceof Error ? e.message : undefined,
      });
    }
  };

  const runAnalysis = async (s: ScanResult) => {
    const startedAt = now();
    const sourceCount = s.kept.length;
    if (sourceCount === 0) {
      setPhase({
        kind: "error",
        message: "No files left to analyse after filtering.",
        detail: `All ${s.totalFiles.toLocaleString()} files matched the ignore rules. Go back and loosen the rules or pick other folders.`,
      });
      return;
    }
    setPhase({ kind: "analysing", stage: 0, done: 0, total: sourceCount, startedAt });
    const fileContents = new Map<string, string>();
    setContents(fileContents);
    try {
      const a = await analyse(
        s.projectName,
        s.kept,
        { totalFiles: s.totalFiles, ignoredFiles: s.ignored.length },
        (stage, done, total) => setPhase({ kind: "analysing", stage: STAGES.indexOf(stage) === -1 ? 0 : STAGES.indexOf(stage), done, total, startedAt }),
        fileContents,
      );
      if (!a.files.some(isSourceFile)) {
        setPhase({
          kind: "error",
          message: "This upload has no recognisable source files.",
          detail: `We analysed ${a.files.length} files but none were code. Supported at launch: JavaScript/TypeScript, Python, Java and Go.`,
        });
        return;
      }
      setAnalysis(a);
      setPhase({ kind: "analysing", stage: 3, done: 0, total: 1, startedAt });
      const d = await requestDiagram(a);
      setPhase({ kind: "analysing", stage: 4, done: 1, total: 1, startedAt });
      saveDiagram(d);
      setPhase({ kind: "view" });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof UploadError ? e.message : "Analysis failed.", detail: e instanceof UploadError ? e.detail : e instanceof Error ? e.message : String(e) });
    }
  };

  const requestDiagram = async (a: Analysis, instructions?: string, previous?: Diagram): Promise<Diagram> => {
    const res = await fetch("/api/group", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: buildPayload(a), instructions, previous }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new UploadError(j.error ?? `Grouping failed (HTTP ${res.status}).`, j.detail);
    return { ...(j.diagram as Diagram), source };
  };

  const regenerate = async (instructions: string) => {
    if (!analysis || !diagram) return;
    setRegenerating(true);
    try {
      const d = await requestDiagram(analysis, instructions || undefined, diagram);
      saveDiagram(d);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  const reset = () => {
    setPhase({ kind: "landing" });
    setDiagram(null);
    setAnalysis(null);
    setContents(new Map());
    try {
      const raw = localStorage.getItem(LAST_KEY);
      setLastSaved(raw ? JSON.parse(raw) : null);
    } catch {
      /* ignore */
    }
  };

  if (phase.kind === "view" && diagram) {
    return (
      <Viewer
        diagram={diagram}
        analysis={analysis}
        contents={contents}
        onChange={saveDiagram}
        onRegenerate={analysis ? regenerate : undefined}
        regenerating={regenerating}
        onNew={reset}
      />
    );
  }

  return (
    <Shell onHome={reset}>
      {phase.kind === "landing" && (
        <Landing
          onFiles={handleFiles}
          onDropTransfer={async (dt) => {
            const folderFiles = await filesFromDataTransfer(dt);
            await handleFiles(folderFiles ?? Array.from(dt.files));
          }}
          onGithub={handleGithub}
          onSample={() => {
            setSource(undefined);
            startScan(sampleEntries());
          }}
          lastSaved={lastSaved}
          onReopen={() => {
            if (!lastSaved) return;
            setDiagram(lastSaved);
            setAnalysis(null);
            setPhase({ kind: "view" });
          }}
        />
      )}
      {phase.kind === "reading" && <Centered>{phase.label}</Centered>}
      {phase.kind === "scan" && (
        <ScanPreview
          scan={phase.scan}
          onBack={reset}
          onRescan={async (rules, folders) => {
            const s = await scan(phase.collected, rules, folders);
            setPhase({ kind: "scan", scan: s, collected: phase.collected });
          }}
          onContinue={() => runAnalysis(phase.scan)}
        />
      )}
      {phase.kind === "analysing" && <AnalysingView {...phase} />}
      {phase.kind === "error" && (
        <div className="mx-auto mt-24 max-w-lg rounded-xl border border-line bg-surface p-6" role="alert">
          <h2 className="text-lg font-semibold">{phase.message}</h2>
          {phase.detail && <p className="mt-2 text-sm text-muted">{phase.detail}</p>}
          <button onClick={reset} className="focus-ring mt-5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
            Try another upload
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, onHome }: { children: React.ReactNode; onHome: () => void }) {
  const { dark, toggle } = useTheme();
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="hero-backdrop pointer-events-none absolute inset-x-0 top-0 h-[900px]" aria-hidden />
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <button onClick={onHome} className="focus-ring rounded-xl" aria-label="CodeAtlasX home">
            <Brand size={36} />
          </button>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how" className="hidden rounded-full px-3 py-1.5 text-muted transition hover:text-foreground sm:block">
              How it works
            </a>
            <a href="#privacy" className="hidden rounded-full px-3 py-1.5 text-muted transition hover:text-foreground sm:block">
              Privacy
            </a>
            <button
              onClick={toggle}
              className="focus-ring ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:text-foreground"
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {dark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>
          </nav>
        </div>
      </header>
      <div className="relative">{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-40 flex flex-col items-center gap-3 text-sm text-muted" role="status">
      <Spinner />
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />;
}

function ScanPreview({
  scan: s,
  onBack,
  onRescan,
  onContinue,
}: {
  scan: ScanResult;
  onBack: () => void;
  onRescan: (rules: string[], folders: string[] | null) => Promise<void>;
  onContinue: () => void;
}) {
  const [rulesText, setRulesText] = useState(s.rules.join("\n"));
  const [editing, setEditing] = useState(false);
  const overCap = s.kept.length > LIMITS.maxSourceFiles;
  const [folders, setFolders] = useState<string[]>(() => s.topFolders.map((f) => f.dir));

  return (
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-8">
      <h1 className="text-2xl font-semibold">{s.projectName}</h1>
      <p className="mt-3 text-lg" role="status">
        Found <strong>{s.totalFiles.toLocaleString()}</strong> files. Ignoring <strong>{s.ignored.length.toLocaleString()}</strong>
        {s.ignoredTopDirs.length > 0 && <span className="text-muted"> ({s.ignoredTopDirs.slice(0, 3).map((d) => d.dir.replace(/\/$/, "")).join(", ")}…)</span>}. Analysing{" "}
        <strong>{s.kept.length.toLocaleString()}</strong>.
      </p>

      {Object.keys(s.ignoredByReason).length > 0 && (
        <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 font-medium">Ignored</h2>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {Object.entries(s.ignoredByReason)
              .sort((a, b) => b[1] - a[1])
              .map(([r, n]) => (
                <li key={r} className="flex justify-between gap-2">
                  <span className="text-muted">{REASON_LABELS[r] ?? r}</span>
                  <span className="tabular-nums">{n.toLocaleString()}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {overCap && (
        <div className="mt-5 rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="alert">
          <strong>{s.kept.length.toLocaleString()} files is above the 5,000-file analysis limit.</strong> Pick the sub-folders to analyse, or add ignore rules.
        </div>
      )}

      {s.topFolders.length > 1 && (
        <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">Folders to analyse</h2>
            <button className="text-xs text-accent hover:underline" onClick={() => setFolders(s.topFolders.map((f) => f.dir))}>
              Select all
            </button>
          </div>
          <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {s.topFolders.map((f) => (
              <label key={f.dir} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={folders.includes(f.dir)}
                  onChange={(e) => setFolders((cur) => (e.target.checked ? [...cur, f.dir] : cur.filter((x) => x !== f.dir)))}
                />
                <span className="truncate font-mono text-xs">{f.dir === "." ? "(root files)" : f.dir + "/"}</span>
                <span className="ml-auto text-xs text-muted">{f.count}</span>
              </label>
            ))}
          </div>
          <button
            className="focus-ring mt-3 rounded-md border border-line px-3 py-1 text-xs hover:bg-surface-2"
            onClick={() => onRescan(rulesText.split("\n"), folders.length === s.topFolders.length ? null : folders)}
          >
            Apply folder selection
          </button>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Ignore rules</h2>
          <button className="text-xs text-accent hover:underline" onClick={() => setEditing((e) => !e)}>
            {editing ? "Hide" : "Edit rules"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">gitignore syntax. Your project&apos;s own .gitignore files are applied too.</p>
        {editing && (
          <>
            <textarea
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              rows={10}
              spellCheck={false}
              aria-label="Ignore rules"
              className="focus-ring mt-2 w-full rounded border border-line bg-background p-2 font-mono text-xs outline-none"
            />
            <div className="mt-2 flex gap-2">
              <button className="focus-ring rounded-md border border-line px-3 py-1 text-xs hover:bg-surface-2" onClick={() => onRescan(rulesText.split("\n"), folders.length === s.topFolders.length ? null : folders)}>
                Re-scan with these rules
              </button>
              <button className="text-xs text-muted hover:underline" onClick={() => setRulesText(DEFAULT_RULES.join("\n"))}>
                Reset to defaults
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <button onClick={onBack} className="focus-ring rounded-md border border-line px-4 py-2 text-sm hover:bg-surface-2">
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={overCap || s.kept.length === 0}
          className="focus-ring rounded-md bg-accent px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Analyse {s.kept.length.toLocaleString()} files →
        </button>
      </div>
    </main>
  );
}

function AnalysingView({ stage, done, total, startedAt }: { stage: number; done: number; total: number; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, (now - startedAt) / 1000);
  return (
    <main className="mx-auto mt-24 max-w-md px-6" aria-live="polite">
      <h1 className="text-lg font-semibold">Analysing…</h1>
      <ol className="mt-5 space-y-3">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                i < stage ? "bg-accent text-white" : i === stage ? "border-2 border-accent" : "border border-line"
              }`}
            >
              {i < stage ? "✓" : ""}
            </span>
            <span className={i <= stage ? "" : "text-muted"}>{s}</span>
            {i === stage && total > 1 && (
              <span className="ml-auto text-xs tabular-nums text-muted">
                {done.toLocaleString()} / {total.toLocaleString()}
              </span>
            )}
            {i === stage && i === 3 && <span className="ml-auto text-xs text-muted">asking Claude…</span>}
          </li>
        ))}
      </ol>
      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${((stage + (total ? done / total : 0)) / STAGES.length) * 100}%` }} />
      </div>
      <p className="mt-2 text-right text-xs tabular-nums text-muted">{secs.toFixed(1)} s</p>
    </main>
  );
}
