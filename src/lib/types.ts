// Shared types for ingestion, analysis and the diagram model.

export interface RawEntry {
  path: string; // normalised, forward slashes, no leading project folder
  size: number;
  read: () => Promise<string>;
}

export type IgnoreReason =
  | "dependency"
  | "vcs"
  | "build"
  | "cache"
  | "lockfile"
  | "binary"
  | "large-image"
  | "gitignore"
  | "custom"
  | "unsupported"
  | "too-large";

export interface ScanResult {
  projectName: string;
  totalFiles: number;
  totalBytes: number;
  kept: RawEntry[];
  ignored: { path: string; reason: IgnoreReason }[];
  ignoredByReason: Record<string, number>;
  ignoredTopDirs: { dir: string; count: number }[];
  topFolders: { dir: string; count: number }[];
  rules: string[];
}

export interface FileInfo {
  path: string;
  language: string;
  size: number;
  lines: number;
  imports: string[]; // resolved internal file paths
  externalImports: string[]; // package names
  summary: string;
  symbols: string[];
  tags: string[]; // entry, route, db:prisma, ext:stripe ...
}

export interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
  lines: number;
  language?: string;
  fileCount: number;
  children?: TreeNode[];
}

export interface StackItem {
  name: string;
  source: string; // manifest path
  kind: "language" | "framework" | "database" | "infra" | "tool" | "service";
}

export interface Analysis {
  projectName: string;
  files: FileInfo[];
  tree: TreeNode;
  stack: StackItem[];
  edges: { from: string; to: string }[];
  readme?: string;
  languages: { language: string; files: number; lines: number }[];
  stats: {
    totalFiles: number;
    ignoredFiles: number;
    analysedFiles: number;
    totalLines: number;
  };
}

export type NodeKind =
  | "actor"
  | "frontend"
  | "feature"
  | "backend"
  | "persistence"
  | "datastore"
  | "external";

export interface DiagramGroup {
  id: string;
  label: string;
  description?: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  primaryFile: string;
  kind: NodeKind;
  groupId: string | null;
  description: string;
  files: string[];
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  style: "sync" | "async";
  basis: "detected" | "inferred";
}

export interface Diagram {
  id: string;
  title: string;
  summary: string;
  groups: DiagramGroup[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  positions?: Record<string, { x: number; y: number }>;
  hiddenGroups?: string[];
  collapsedGroups?: string[];
  layoutVersion?: number;
  source?: DiagramSource;
  generatedBy: "claude" | "heuristic";
  warnings?: string[];
  createdAt: string;
}

export interface DiagramSource {
  type: "github";
  owner: string;
  repo: string;
  ref: string; // branch, tag or commit used for file links
  subpath?: string;
  url: string;
}
