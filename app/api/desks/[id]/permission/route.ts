import { NextResponse } from "next/server";
import { office } from "@/lib/office";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const desk = office.get(id);
  if (!desk) return NextResponse.json({ error: "desk not found" }, { status: 404 });

  const body = (await req.json()) as { requestId: string; decision: "allow" | "always" | "deny" };
  const ok = desk.resolvePermission(body.requestId, body.decision !== "deny", body.decision === "always");
  return NextResponse.json({ ok });
}
