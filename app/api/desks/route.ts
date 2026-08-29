import { NextResponse } from "next/server";
import { office } from "@/lib/office";
import type { PermissionMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ desks: office.list() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    cwd?: string;
    model?: string;
    role?: string;
    permissionMode?: PermissionMode;
    firstMessage?: string;
  };

  const desk = office.create({
    name: body.name?.trim() || "Mesa nova",
    cwd: body.cwd?.trim() || process.env.HOME || process.cwd(),
    model: body.model || "opus",
    role: body.role || "",
    permissionMode: body.permissionMode || "default",
  });

  if (body.firstMessage?.trim()) desk.send(body.firstMessage.trim());

  return NextResponse.json({ desk: desk.summary() });
}
