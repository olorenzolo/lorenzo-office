import { NextResponse } from "next/server";
import { office } from "@/lib/office";
import type { PermissionMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const desk = office.get(id);
  if (!desk) return NextResponse.json({ error: "desk not found" }, { status: 404 });

  const body = (await req.json()) as {
    action: "interrupt" | "model" | "permissionMode" | "rename" | "read";
    value?: string;
  };

  switch (body.action) {
    case "interrupt":
      await desk.interrupt();
      break;
    case "model":
      if (body.value) await desk.setModel(body.value);
      break;
    case "permissionMode":
      if (body.value) await desk.setPermissionMode(body.value as PermissionMode);
      break;
    case "rename":
      if (body.value?.trim()) desk.name = body.value.trim();
      break;
    case "read":
      desk.markRead();
      break;
  }

  return NextResponse.json({ desk: desk.summary() });
}
