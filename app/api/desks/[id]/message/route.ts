import { NextResponse } from "next/server";
import { office } from "@/lib/office";
import type { Attachment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const desk = office.get(id);
  if (!desk) return NextResponse.json({ error: "desk not found" }, { status: 404 });

  const { text, attachments } = (await req.json()) as { text?: string; attachments?: Attachment[] };
  if (!text?.trim() && !attachments?.length) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  desk.send(text ?? "", attachments ?? []);
  return NextResponse.json({ ok: true });
}
