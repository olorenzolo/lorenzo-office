import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readConfig, speakable, synthesize } from "@/lib/voice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE = path.join(os.homedir(), ".lorenzo-office", "voice-cache");

/**
 * Speaking the same reply twice should not cost credits twice, so the audio is
 * cached by the text plus the voice settings that produced it.
 */
export async function POST(req: Request) {
  const { text } = (await req.json()) as { text?: string };
  const clean = speakable(text ?? "");
  if (!clean) return NextResponse.json({ error: "nada para falar" }, { status: 400 });

  const cfg = readConfig();
  const key = createHash("sha256")
    .update(`${clean}|${cfg.voiceId}|${cfg.modelId}|${cfg.stability}|${cfg.similarityBoost}|${cfg.speed}`)
    .digest("hex")
    .slice(0, 32);

  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${key}.mp3`);

  if (!fs.existsSync(file)) {
    try {
      const audio = await synthesize(clean);
      fs.writeFileSync(file, Buffer.from(audio));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "falha ao gerar voz" },
        { status: 400 },
      );
    }
  }

  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" },
  });
}
