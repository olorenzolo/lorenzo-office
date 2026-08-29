import { NextResponse } from "next/server";
import { office } from "@/lib/office";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const desk = office.get(id);
  if (!desk) return NextResponse.json({ error: "desk not found" }, { status: 404 });
  desk.markRead();
  return NextResponse.json({
    desk: desk.summary(),
    init: desk.init,
    events: desk.history(),
    pending: desk.pendingList(),
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await office.remove(id);
  return NextResponse.json({ ok: true });
}
