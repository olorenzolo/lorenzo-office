import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STORE = path.join(os.homedir(), ".lorenzo-office");
const CONFIG = path.join(STORE, "config.json");

export interface VoiceConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  speed: number;
}

const DEFAULTS: VoiceConfig = {
  apiKey: "",
  // Rachel, the ElevenLabs default; replaced as soon as the user picks a voice.
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  modelId: "eleven_multilingual_v2",
  stability: 0.5,
  similarityBoost: 0.75,
  speed: 1.0,
};

/**
 * The key lives here and nowhere else: outside the repository, outside the
 * bundle, never sent to the browser. Only the audio bytes cross to the page.
 */
export function readConfig(): VoiceConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG, "utf8")) as { elevenlabs?: Partial<VoiceConfig> };
    return { ...DEFAULTS, ...(raw.elevenlabs ?? {}) };
  } catch {
    return DEFAULTS;
  }
}

export function writeConfig(patch: Partial<VoiceConfig>) {
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(fs.readFileSync(CONFIG, "utf8")) as Record<string, unknown>;
  } catch {
    /* first write */
  }
  const elevenlabs = { ...readConfig(), ...patch };
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ ...current, elevenlabs }, null, 2));
}

export function isConfigured(): boolean {
  return readConfig().apiKey.trim().length > 0;
}

const API = "https://api.elevenlabs.io/v1";

export interface Voice {
  id: string;
  name: string;
  category: string;
  preview: string | null;
}

export async function listVoices(): Promise<Voice[]> {
  const { apiKey } = readConfig();
  if (!apiKey) throw new Error("sem chave configurada");

  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs respondeu ${res.status}`);

  const data = (await res.json()) as {
    voices: { voice_id: string; name: string; category?: string; preview_url?: string }[];
  };
  return data.voices.map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category ?? "",
    preview: v.preview_url ?? null,
  }));
}

/** Strips what should not be read aloud: code, tables, links, markup. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " — bloco de código — ")
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
}

export async function synthesize(text: string): Promise<ArrayBuffer> {
  const cfg = readConfig();
  if (!cfg.apiKey) throw new Error("sem chave configurada");

  const res = await fetch(`${API}/text-to-speech/${cfg.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": cfg.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: cfg.modelId,
      voice_settings: {
        stability: cfg.stability,
        similarity_boost: cfg.similarityBoost,
        speed: cfg.speed,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 180)}`);
  }
  return res.arrayBuffer();
}
