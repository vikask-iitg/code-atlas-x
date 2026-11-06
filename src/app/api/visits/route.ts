import { NextResponse } from "next/server";
import { countVisit } from "@/lib/store";

/** POST { new: true } counts a first-time visitor; POST {} just reads the total. */
export async function POST(req: Request) {
  let increment = false;
  try {
    increment = ((await req.json()) as { new?: boolean }).new === true;
  } catch {}
  try {
    const count = await countVisit(increment);
    if (count === null) return NextResponse.json({ error: "Visitor counter not configured." }, { status: 501 });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: "Counter unavailable." }, { status: 503 });
  }
}
