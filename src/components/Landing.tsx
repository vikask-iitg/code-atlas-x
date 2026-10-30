"use client";

import { useRef, useState } from "react";
import type { Diagram } from "@/lib/types";
import { Logo } from "./Viewer";

interface Props {
  onFiles: (f: File[]) => void;
  onDropTransfer: (dt: DataTransfer) => void;
  onSample: () => void;
  onGithub: (url: string) => void;
  lastSaved: Diagram | null;
  onReopen: () => void;
}

export function Landing({
  onFiles,
  onDropTransfer,
  onSample,
  onGithub,
  lastSaved,
  onReopen,
}: Props) {
  const [drag, setDrag] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  return (
    <main className="relative">
      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pb-14 pt-8 text-center sm:pt-12 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-16 lg:pt-4 lg:text-left">
        <div>
          <div className="fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted shadow-sm backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--k-backend-bd)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--k-backend-bd)]" />
            </span>
            Local folders, zips or GitHub repos · no account needed
          </div>

          <h1
            className="fade-up mx-auto mt-6 max-w-4xl font-display text-[3.3rem] leading-[1.02] tracking-tight sm:text-[4.4rem] lg:mx-0 xl:text-[5rem]"
            style={{ animationDelay: "60ms" }}
          >
            Every codebase
            <br />
            <em className="hero-gradient pr-2">deserves a map.</em>
          </h1>

          <p
            className="fade-up mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-muted lg:mx-0"
            style={{ animationDelay: "120ms" }}
          >
            Drop in any project or paste a GitHub URL and get an interactive
            architecture diagram in under a minute: grouped components, labelled
            relationships and data stores, each one traced back to real files.
          </p>

          <dl
            className="fade-up mx-auto mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6 lg:mx-0"
            style={{ animationDelay: "160ms" }}
          >
            {[
              ["< 60 s", "upload to diagram"],
              ["4", "languages at launch"],
              ["0", "setup or sign-up"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="font-display text-3xl tracking-tight">{v}</dt>
                <dd className="mt-0.5 text-xs text-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Drop zone */}
        <div
          className="fade-up mx-auto w-full max-w-xl text-center"
          style={{ animationDelay: "180ms" }}
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onDropTransfer(e.dataTransfer);
            }}
            className={`dropzone group relative rounded-3xl p-[1.5px] transition-transform duration-300 ${drag ? "scale-[1.015]" : ""}`}
            data-drag={drag || undefined}
          >
            <div className="relative overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-surface/85 px-6 py-10 shadow-[0_1px_0_rgba(0,0,0,0.03),0_20px_50px_-20px_rgba(30,40,80,0.25)] backdrop-blur-xl sm:px-9 sm:py-9">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-background shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
              </div>
              <div className="mt-4 text-xl font-semibold tracking-tight">
                {drag ? "Release to upload" : "Drop a .zip, folder or files, or paste a GitHub repo"}
              </div>
              <p className="mt-1.5 text-sm text-muted">
                Up to 200 MB · dependencies and build output skipped
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <button
                  onClick={() => fileInput.current?.click()}
                  className="focus-ring rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-sm transition hover:opacity-90 active:scale-[0.98]"
                >
                  Choose .zip or files
                </button>
                <button
                  onClick={() => folderInput.current?.click()}
                  className="focus-ring rounded-full border border-line bg-background px-5 py-2.5 text-sm font-medium transition hover:bg-surface-2 active:scale-[0.98]"
                >
                  Choose folder
                </button>
              </div>

              <div className="mx-auto mt-7 flex max-w-md items-center gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                <span className="h-px flex-1 bg-line" />
                or paste a GitHub repo URL
                <span className="h-px flex-1 bg-line" />
              </div>
              <form
                className="mx-auto mt-4 flex max-w-md items-center gap-1.5 rounded-full border border-line bg-background p-1.5 pl-4 shadow-sm transition focus-within:border-foreground/30 focus-within:shadow-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (repoUrl.trim()) onGithub(repoUrl.trim());
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="shrink-0 text-muted"
                  aria-hidden
                >
                  <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
                </svg>
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="github.com/owner/repo"
                  aria-label="GitHub repository URL"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted/70"
                />
                <button
                  type="submit"
                  disabled={!repoUrl.trim()}
                  className="focus-ring shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  Visualize
                </button>
              </form>
              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 text-[11px] text-muted">
                <span>Try:</span>
                {["pallets/flask", "expressjs/express", "gin-gonic/gin"].map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRepoUrl(`https://github.com/${r}`)}
                      className="focus-ring font-mono hover:text-accent hover:underline"
                    >
                      {r}
                    </button>
                  ),
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
                {[
                  ["TypeScript", "#3178c6"],
                  ["JavaScript", "#e5b400"],
                  ["Python", "#3572a5"],
                  ["Java", "#b07219"],
                  ["Go", "#00add8"],
                ].map(([l, c]) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-background/60 px-2.5 py-0.5 text-[11px] text-muted"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: c }}
                    />
                    {l}
                  </span>
                ))}
              </div>

              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
              />
              <input
                ref={folderInput}
                type="file"
                hidden
                // @ts-expect-error non-standard attribute for folder upload (U2)
                webkitdirectory=""
                directory=""
                onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <button
              onClick={onSample}
              className="focus-ring group inline-flex items-center gap-1.5 font-medium text-accent"
            >
              Try a sample project
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </button>
            {lastSaved && (
              <>
                <span className="h-4 w-px bg-line" aria-hidden />
                <button
                  onClick={onReopen}
                  className="focus-ring inline-flex items-center gap-1.5 text-muted transition hover:text-foreground"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Reopen “{lastSaved.title}”
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Product preview */}
      <section
        className="fade-up mx-auto max-w-5xl px-6"
        style={{ animationDelay: "260ms" }}
        aria-label="Example diagram"
      >
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(30,40,80,0.35)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-xs font-medium">Canavas</span>
            <span className="ml-auto hidden gap-1.5 text-[11px] text-muted sm:flex">
              <span className="rounded border border-line px-2 py-0.5">
                Architecture
              </span>
              <span className="rounded border border-line px-2 py-0.5">
                Export
              </span>
            </span>
          </div>
          <div className="preview-grid relative">
            <PreviewDiagram />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-5xl px-6 pt-28">
        <SectionTitle
          eyebrow="How it works"
          title="From zip to diagram in four steps"
        />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          {[
            [
              "Upload",
              "Drop a .zip, a folder or loose files, or paste a GitHub URL. Nothing to install.",
            ],
            [
              "Filter",
              "node_modules, .venv, build output, lockfiles and your .gitignore are removed.",
            ],
            [
              "Group",
              "Imports are parsed into a dependency graph, then grouped into named components.",
            ],
            [
              "Explore",
              "Click any box to see its files and source. Export or share when ready.",
            ],
          ].map(([t, d], i) => (
            <li key={t} className="bg-surface p-6">
              <span className="font-display text-3xl italic text-muted">
                0{i + 1}
              </span>
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pt-24">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(30,40,80,0.35)]"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: `var(--k-${f.tone}-bg)`,
                  color: `var(--k-${f.tone}-bd)`,
                }}
              >
                {f.icon}
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section
        id="privacy"
        className="mx-auto max-w-5xl px-6 pb-24 pt-24"
        aria-labelledby="privacy-title"
      >
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 sm:p-10">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--k-backend-bg)] opacity-60 blur-3xl"
            aria-hidden
          />
          <div className="relative grid gap-10 sm:grid-cols-[1fr_1.4fr]">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--k-backend-bg)] text-[var(--k-backend-bd)]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </div>
              <h2
                id="privacy-title"
                className="mt-4 font-display text-4xl leading-tight tracking-tight"
              >
                Your code stays <em>yours.</em>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Built for private, client and legacy code that can&apos;t go on
                a public repo.
              </p>
            </div>
            <ul className="space-y-5 text-sm">
              {[
                [
                  "Parsed in your browser",
                  "Uploads and GitHub archives are unpacked and analysed in this tab. Code is never executed, and source files are never stored on our server.",
                ],
                [
                  "Only summaries go to Claude",
                  "To name components we send file paths, line counts, function and class names, imports, short doc comments and a README excerpt. .env files, API keys, tokens and connection strings are removed first.",
                ],
                [
                  "Nothing kept by default",
                  "Source is gone when you close the tab. Only the diagram JSON is saved, and only if you create a share link, which expires after 30 days. Uploads are never used for training.",
                ],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] text-background">
                    ✓
                  </span>
                  <div>
                    <div className="font-medium">{t}</div>
                    <p className="mt-0.5 leading-relaxed text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-6 text-xs text-muted lg:flex-row">
          <div className="flex items-center gap-2.5 text-center lg:text-left">
            <Logo size={22} />
            <span>
              <span className="font-semibold text-foreground">CodeAtlasX</span> · architecture diagrams for any codebase: local, private or on GitHub
            </span>
          </div>

          <div className="flex items-center gap-1">
            <a
              href="https://github.com/vikask-iitg"
              target="_blank"
              rel="noreferrer"
              className="focus-ring group flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small external avatar */}
              <img
                src="https://github.com/vikask-iitg.png?size=64"
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 rounded-full border border-line bg-surface-2"
              />
              <span className="whitespace-nowrap">
                Developed by <span className="font-semibold text-foreground group-hover:text-accent">Vikas Kumar Khurendra</span>
              </span>
            </a>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            <a
              href="https://github.com/vikask-iitg"
              target="_blank"
              rel="noreferrer"
              title="GitHub profile"
              aria-label="GitHub profile of Vikas Kumar Khurendra"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-surface hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
              </svg>
            </a>
            <a
              href="https://github.com/vikask-iitg/code-atlas-x"
              target="_blank"
              rel="noreferrer"
              title="Source code"
              aria-label="CodeAtlasX source code on GitHub"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-surface hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {eyebrow}
      </div>
      <h2 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
        {title}
      </h2>
    </div>
  );
}

const icon = (d: React.ReactNode) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {d}
  </svg>
);

const FEATURES = [
  {
    tone: "frontend",
    title: "Strips the noise",
    body: "A 140 MB upload with 6,882 files becomes the ~290 that matter. Dependencies, caches and build output are filtered before analysis.",
    icon: icon(<path d="M3 5h18l-7 8v6l-4 2v-8z" />),
  },
  {
    tone: "feature",
    title: "Grounded in real files",
    body: "Every box maps to files in your upload. Relationships confirmed by imports are drawn solid; inferred ones are marked.",
    icon: icon(
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6M9 14l2 2 4-4" />
      </>,
    ),
  },
  {
    tone: "persistence",
    title: "Export and share",
    body: "Download PNG, SVG, PDF or Mermaid source for your docs, or send a private view-only link.",
    icon: icon(
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
      </>,
    ),
  },
];

/** Illustrative mini architecture diagram in the product's own visual language. */
function PreviewDiagram() {
  const box = (
    x: number,
    y: number,
    w: number,
    label: string,
    file: string,
    k: string,
  ) => (
    <g className="preview-node">
      <rect
        x={x}
        y={y}
        width={w}
        height={46}
        rx={7}
        fill={`var(--k-${k}-bg)`}
        stroke={`var(--k-${k}-bd)`}
        strokeWidth={1.6}
      />
      <text
        x={x + w / 2}
        y={y + 20}
        textAnchor="middle"
        fontSize={12.5}
        fontWeight={600}
        fill="var(--k-text)"
      >
        {label}
      </text>
      <text
        x={x + w / 2}
        y={y + 35}
        textAnchor="middle"
        fontSize={10}
        fill="var(--k-text)"
        opacity={0.65}
        fontFamily="var(--font-geist-mono)"
      >
        [{file}]
      </text>
    </g>
  );
  const cyl = (x: number, y: number, w: number, label: string) => (
    <g className="preview-node">
      <path
        d={`M${x} ${y + 8} A ${w / 2} 8 0 0 1 ${x + w} ${y + 8} L ${x + w} ${y + 50} A ${w / 2} 8 0 0 1 ${x} ${y + 50} Z`}
        fill="var(--k-datastore-bg)"
        stroke="var(--k-datastore-bd)"
        strokeWidth={1.6}
      />
      <path
        d={`M${x} ${y + 8} A ${w / 2} 8 0 0 0 ${x + w} ${y + 8}`}
        fill="none"
        stroke="var(--k-datastore-bd)"
        strokeWidth={1.6}
      />
      <text
        x={x + w / 2}
        y={y + 36}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="var(--k-text)"
      >
        {label}
      </text>
    </g>
  );
  const edge = (d: string, label?: string, lx = 0, ly = 0, dashed = false) => (
    <g>
      <path
        d={d}
        fill="none"
        stroke="var(--edge)"
        strokeWidth={1.4}
        markerEnd="url(#arrow)"
        className={dashed ? "flow-dash" : undefined}
        strokeDasharray={dashed ? "5 4" : undefined}
      />
      {label && (
        <g>
          <rect
            x={lx - label.length * 3.1 - 6}
            y={ly - 9}
            width={label.length * 6.2 + 12}
            height={17}
            rx={4}
            fill="var(--edge-label-bg)"
          />
          <text
            x={lx}
            y={ly + 3}
            textAnchor="middle"
            fontSize={10.5}
            fill="var(--foreground)"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
  const group = (x: number, y: number, w: number, h: number, title: string) => (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill="var(--group-bg)"
        stroke="var(--group-bd)"
        strokeWidth={1.2}
      />
      <text
        x={x + 16}
        y={y + 22}
        fontSize={11.5}
        fontWeight={600}
        fill="var(--muted)"
      >
        {title}
      </text>
    </g>
  );

  return (
    <svg
      viewBox="0 0 960 470"
      className="block h-auto w-full"
      role="img"
      aria-label="Example architecture diagram: a browser user, a web application, API services and data stores"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--edge)" />
        </marker>
      </defs>

      {group(60, 112, 400, 196, "Web application")}
      {group(500, 112, 400, 196, "API services")}

      {/* actor */}
      <g className="preview-node">
        <circle
          cx={260}
          cy={50}
          r={32}
          fill="var(--k-actor-bg)"
          stroke="var(--k-actor-bd)"
          strokeWidth={1.6}
        />
        <text
          x={260}
          y={48}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--k-text)"
        >
          Browser
        </text>
        <text
          x={260}
          y={61}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--k-text)"
        >
          user
        </text>
      </g>

      {box(90, 150, 160, "App routes", "App.tsx", "frontend")}
      {box(280, 150, 160, "Editor page", "EditorPage.tsx", "feature")}
      {box(90, 240, 160, "Sync engine", "syncEngine.ts", "persistence")}
      {box(280, 240, 160, "Canvas", "Canvas.tsx", "feature")}

      {box(530, 150, 160, "Express API", "app.js", "backend")}
      {box(720, 150, 160, "Agent pipeline", "orchestrator.py", "backend")}
      {box(530, 240, 160, "File storage", "storage.js", "persistence")}
      {box(720, 240, 160, "Asset pipeline", "pipeline.py", "backend")}

      {cyl(100, 370, 140, "IndexedDB")}
      {cyl(450, 370, 140, "PostgreSQL")}
      {cyl(740, 370, 140, "Blob / S3")}

      {edge("M260 82 L260 110 L170 110 L170 148", "uses app", 215, 110)}
      {edge("M250 173 L278 173")}
      {edge("M360 196 L360 238", "renders", 360, 217)}
      {edge("M440 173 L528 173", "REST requests", 484, 162, true)}
      {edge("M690 173 L718 173")}
      {edge("M800 196 L800 238", "makes assets", 800, 217)}
      {edge("M170 286 L170 368", "backs up offline", 170, 330, true)}
      {edge("M610 196 L610 238", "stores thumbs", 610, 217)}
      {edge("M580 286 L580 330 L520 330 L520 368", "queries", 552, 330)}
      {edge("M800 286 L800 368", "uploads", 800, 330)}
      {edge("M640 286 L640 345 L780 345 L780 368")}
    </svg>
  );
}
