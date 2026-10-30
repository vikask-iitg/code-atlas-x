"use client";

import { useEffect, useState } from "react";
import { shikiLang } from "@/lib/languages";

const MAX_LINES = 1500;

export function CodePreview({ path, content: local, remoteUrl }: { path: string; content: string | undefined; remoteUrl?: string }) {
  // Fall back to fetching public GitHub source when the upload isn't in this tab.
  const [remote, setRemote] = useState<{ url: string; text?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    if (local != null || !remoteUrl) return;
    let cancelled = false;
    fetch(remoteUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((text) => !cancelled && setRemote({ url: remoteUrl, text }))
      .catch(() => !cancelled && setRemote({ url: remoteUrl, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [local, remoteUrl]);
  const remoteState = remote?.url === remoteUrl ? remote : null;
  const content = local ?? remoteState?.text;
  const key = `${path}:${content?.length ?? -1}`;
  const [result, setResult] = useState<{ key: string; html?: string; failed?: boolean } | null>(null);
  const html = result?.key === key ? (result.html ?? null) : null;
  const failed = result?.key === key && !!result.failed;

  useEffect(() => {
    let cancelled = false;
    if (content == null) return;
    const lines = content.split("\n");
    const code = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES).join("\n") + `\n\n… ${lines.length - MAX_LINES} more lines` : content;
    import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(code, { lang: shikiLang(path), themes: { light: "github-light", dark: "github-dark" }, defaultColor: "light" }).catch(() =>
          codeToHtml(code, { lang: "text", themes: { light: "github-light", dark: "github-dark" }, defaultColor: "light" }),
        ),
      )
      .then((h) => !cancelled && setResult({ key, html: h }))
      .catch(() => !cancelled && setResult({ key, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [path, content, key]);

  if (content == null && remoteUrl && !remoteState) return <div className="p-3 text-xs text-muted">Loading from GitHub…</div>;
  if (content == null) {
    if (remoteState?.failed)
      return <p className="p-3 text-xs text-muted">Couldn&apos;t load this file from GitHub (it may be private). Open it on GitHub instead.</p>;
    return (
      <p className="p-3 text-xs text-muted">
        Source isn&apos;t available here. Uploaded files are kept only in the browser tab that analysed them, and are never stored on the server.
      </p>
    );
  }
  if (failed) return <pre className="overflow-auto p-3 text-xs">{content.slice(0, 50000)}</pre>;
  if (!html) return <div className="p-3 text-xs text-muted">Highlighting…</div>;
  return <div className="shiki-wrap" dangerouslySetInnerHTML={{ __html: html }} />;
}
