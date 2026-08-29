import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";

const CONFIG = path.join(os.homedir(), ".claude", "claude-office-config.env");
// The pixel office is served by its own backend, which also hosts its static build.
// Static build of the pixel office; its API lives on 8000 and is reached by the page itself.
const BASE = process.env.VIZ_URL ?? "http://localhost:3000";

/**
 * The pixel office runs as its own service and authorises the page through a
 * launch token. Reading that key here keeps it out of the bundle: the browser
 * only ever receives the finished URL.
 */
export async function GET() {
  let key = "";
  try {
    const match = /^CLAUDE_OFFICE_API_KEY="?([^"\n]+)"?/m.exec(fs.readFileSync(CONFIG, "utf8"));
    key = match?.[1] ?? "";
  } catch {
    /* visualiser not installed */
  }

  let up = false;
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) });
    up = res.ok;
  } catch {
    up = false;
  }

  return NextResponse.json({ url: key ? `${BASE}/?token=${encodeURIComponent(key)}` : BASE, up });
}
