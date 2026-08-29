import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

/** Directory browser for the working-directory picker. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("path") || os.homedir();
  const target = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;

  try {
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: path.join(target, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return NextResponse.json({
      path: target,
      parent: path.dirname(target) === target ? null : path.dirname(target),
      entries,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cannot read directory" },
      { status: 400 },
    );
  }
}
