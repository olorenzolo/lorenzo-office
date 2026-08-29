import { NextResponse } from "next/server";
import { isConfigured, listVoices, readConfig, writeConfig } from "@/lib/voice";

export const dynamic = "force-dynamic";

/** Never returns the key itself — only whether one exists. */
export async function GET() {
  const cfg = readConfig();
  const configured = isConfigured();

  let voices: Awaited<ReturnType<typeof listVoices>> = [];
  let error: string | null = null;
  if (configured) {
    try {
      voices = await listVoices();
    } catch (err) {
      error = err instanceof Error ? err.message : "falha ao listar vozes";
    }
  }

  return NextResponse.json({
    configured,
    voiceId: cfg.voiceId,
    stability: cfg.stability,
    similarityBoost: cfg.similarityBoost,
    speed: cfg.speed,
    voices,
    error,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    voiceId?: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
  };
  writeConfig(body);
  return NextResponse.json({ ok: true });
}
