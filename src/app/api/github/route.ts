import { NextResponse, type NextRequest } from "next/server";
import { parseGithubUrl } from "@/lib/github";
import { LIMITS } from "@/lib/ingest";

export const maxDuration = 120;

/**
 * Proxies a GitHub repository archive to the browser (GitHub's archive endpoints don't allow
 * cross-origin reads). The archive is streamed straight through and never written to disk;
 * parsing happens in the browser exactly like an uploaded .zip.
 * Set GITHUB_TOKEN to import private repositories and raise the API rate limit.
 */
export async function GET(req: NextRequest) {
  const parsed = parseGithubUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!parsed) {
    return NextResponse.json(
      { error: "That doesn't look like a GitHub repository URL.", detail: "Use a link like https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/folder." },
      { status: 400 },
    );
  }
  const { owner, repo, ref } = parsed;
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { "user-agent": "codeatlasx", accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const candidates = [
    `https://api.github.com/repos/${owner}/${repo}/zipball${ref ? `/${encodeURIComponent(ref)}` : ""}`,
    `https://codeload.github.com/${owner}/${repo}/zip/${ref ? encodeURIComponent(ref) : "HEAD"}`,
  ];

  let res: Response | null = null;
  let lastStatus = 0;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers, redirect: "follow", cache: "no-store" });
      if (r.ok && r.body) {
        res = r;
        break;
      }
      lastStatus = r.status;
    } catch {
      lastStatus = 502;
    }
  }

  if (!res) {
    const msg =
      lastStatus === 404
        ? {
            error: `Repository ${owner}/${repo}${ref ? ` (${ref})` : ""} wasn't found.`,
            detail: token ? "Check the URL and branch name, and that the token can read this repository." : "Check the URL. Private repositories need a GITHUB_TOKEN on the server.",
          }
        : lastStatus === 403 || lastStatus === 429
          ? { error: "GitHub's rate limit was reached.", detail: "Wait a few minutes, or set GITHUB_TOKEN on the server for a higher limit." }
          : { error: "We couldn't download this repository from GitHub.", detail: `GitHub responded with HTTP ${lastStatus || "error"}.` };
    return NextResponse.json(msg, { status: lastStatus === 404 ? 404 : 502 });
  }

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > LIMITS.zipBytes) {
    return NextResponse.json(
      { error: `This repository's archive is ${(declared / 1024 / 1024).toFixed(0)} MB; the limit is 200 MB.`, detail: "Link to a sub-folder (…/tree/branch/folder) or upload a trimmed .zip." },
      { status: 413 },
    );
  }

  // Enforce the size limit while streaming (codeload often omits content-length).
  let seen = 0;
  const limited = res.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > LIMITS.zipBytes) controller.error(new Error("too large"));
        else controller.enqueue(chunk);
      },
    }),
  );

  return new Response(limited, {
    headers: {
      "content-type": "application/zip",
      "cache-control": "no-store",
      ...(declared ? { "content-length": String(declared) } : {}),
    },
  });
}
