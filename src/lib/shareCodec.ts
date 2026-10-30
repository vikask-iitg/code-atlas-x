import type { Diagram } from "./types";

/**
 * Self-contained share links: the diagram JSON is deflated and base64url-encoded into the
 * URL fragment (#…), which browsers never send to the server. Used on hosts without
 * persistent storage (e.g. Vercel) so sharing still works with zero server state.
 */

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeDiagram(d: Diagram): Promise<string> {
  // Drop generation notes to keep links short.
  const { warnings: _w, ...rest } = d;
  void _w;
  const json = new TextEncoder().encode(JSON.stringify(rest));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeDiagram(s: string): Promise<Diagram> {
  const bytes = await pipe(fromBase64Url(s), new DecompressionStream("deflate-raw"));
  const d = JSON.parse(new TextDecoder().decode(bytes)) as Diagram;
  if (!Array.isArray(d?.nodes) || !Array.isArray(d?.edges)) throw new Error("This link doesn't contain a valid diagram.");
  return d;
}
