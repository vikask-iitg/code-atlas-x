import type { Analysis, StackItem } from "./types";
import { isSourceFile } from "./analyze";

/**
 * The only project data that leaves the browser: per-file summaries (path, language,
 * line count, symbol names, detected tags, internal imports) plus a redacted README excerpt.
 * Whole files are never sent.
 */
export interface FileSummary {
  p: string; // path
  l: string; // language
  n: number; // lines
  s?: string; // doc summary
  y?: string[]; // symbols
  t?: string[]; // tags
  i?: string[]; // internal imports
  x?: string[]; // external packages
}

export interface AnalysisPayload {
  projectName: string;
  stack: StackItem[];
  readme?: string;
  files: FileSummary[];
  otherFiles: string[]; // non-source paths (configs, docs) for context
  stats: Analysis["stats"];
}

const MAX_SUMMARIES = 900;

export function buildPayload(a: Analysis): AnalysisPayload {
  const source = a.files.filter(isSourceFile);
  // Rank by connectivity so the most central files survive the cap on very large projects.
  const inDeg = new Map<string, number>();
  for (const e of a.edges) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  const ranked =
    source.length > MAX_SUMMARIES
      ? source
          .slice()
          .sort(
            (x, y) =>
              (inDeg.get(y.path) ?? 0) + y.imports.length + (y.tags.length ? 5 : 0) -
              ((inDeg.get(x.path) ?? 0) + x.imports.length + (x.tags.length ? 5 : 0)),
          )
          .slice(0, MAX_SUMMARIES)
      : source;
  const files: FileSummary[] = ranked.map((f) => ({
    p: f.path,
    l: f.language,
    n: f.lines,
    ...(f.summary ? { s: f.summary } : {}),
    ...(f.symbols.length ? { y: f.symbols.slice(0, 8) } : {}),
    ...(f.tags.length ? { t: f.tags } : {}),
    ...(f.imports.length ? { i: f.imports } : {}),
    ...(f.externalImports.length ? { x: f.externalImports.slice(0, 10) } : {}),
  }));
  const kept = new Set(files.map((f) => f.p));
  const otherFiles = a.files
    .filter((f) => !kept.has(f.path))
    .map((f) => f.path)
    .slice(0, 600);
  return { projectName: a.projectName, stack: a.stack, readme: a.readme, files, otherFiles, stats: a.stats };
}

/** Every path the diagram may cite (A6). */
export function allPaths(p: AnalysisPayload): Set<string> {
  return new Set([...p.files.map((f) => f.p), ...p.otherFiles]);
}
