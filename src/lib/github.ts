/** GitHub URL import (E5). Shared by the client and the /api/github proxy. */

export interface GithubRef {
  owner: string;
  repo: string;
  ref?: string; // branch, tag or commit; default branch when absent
  subpath?: string; // folder inside the repo to analyse
}

const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Accepts:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/branch/some/folder
 *   github.com/owner/repo, owner/repo, git@github.com:owner/repo.git
 */
export function parseGithubUrl(input: string): GithubRef | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^git@github\.com:/i, "github.com/");
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (/^github\.com\//i.test(s)) s = s.slice("github.com/".length);
  else if (s.includes(".") && s.split("/")[0].includes(".")) return null; // other host
  s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const parts = s.split("/");
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  const out: GithubRef = { owner, repo };
  if ((parts[2] === "tree" || parts[2] === "blob") && parts[3]) {
    out.ref = decodeURIComponent(parts[3]);
    const sub = parts.slice(4).join("/");
    if (sub) out.subpath = decodeURIComponent(parts[2] === "blob" ? sub.split("/").slice(0, -1).join("/") : sub) || undefined;
  }
  return out;
}

export function githubFileUrl(src: { owner: string; repo: string; ref: string; subpath?: string }, path: string) {
  const full = [src.subpath, path].filter(Boolean).join("/");
  return `https://github.com/${src.owner}/${src.repo}/blob/${src.ref.split("/").map(encodeURIComponent).join("/")}/${full.split("/").map(encodeURIComponent).join("/")}`;
}

export function githubRawUrl(src: { owner: string; repo: string; ref: string; subpath?: string }, path: string) {
  const full = [src.subpath, path].filter(Boolean).join("/");
  return `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${src.ref.split("/").map(encodeURIComponent).join("/")}/${full.split("/").map(encodeURIComponent).join("/")}`;
}
