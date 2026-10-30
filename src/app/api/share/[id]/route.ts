import { NextResponse, type NextRequest } from "next/server";
import { getShare } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rec = await getShare(id);
  if (!rec) return NextResponse.json({ error: "This share link doesn't exist or has expired." }, { status: 404 });
  return NextResponse.json(rec);
}
