import { NextResponse } from "next/server";
import { appendFeedback } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { diagramId?: string; rating?: string; generatedBy?: string; nodes?: number };
    if (body.rating !== "up" && body.rating !== "down") return NextResponse.json({ error: "rating must be up or down" }, { status: 400 });
    await appendFeedback({ diagramId: String(body.diagramId ?? ""), rating: body.rating, generatedBy: body.generatedBy, nodes: body.nodes });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
