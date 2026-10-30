import { NextResponse } from "next/server";
import { createShare, persistentShares } from "@/lib/store";
import type { Diagram } from "@/lib/types";

const MAX_BYTES = 2_000_000;

export async function POST(req: Request) {
  if (!persistentShares) {
    return NextResponse.json({ error: "No persistent storage on this host.", fallback: "inline" }, { status: 501 });
  }
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Diagram is too large to share (2 MB limit)." }, { status: 413 });
  let diagram: Diagram;
  try {
    diagram = (JSON.parse(text) as { diagram: Diagram }).diagram;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    return NextResponse.json({ error: "Missing diagram." }, { status: 400 });
  }
  const rec = await createShare(diagram);
  return NextResponse.json({ id: rec.id, expiresAt: rec.expiresAt });
}
