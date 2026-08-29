import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECTS = path.join(os.homedir(), ".claude", "projects");

/** One assistant reply, as recorded in a Claude Code session transcript. */
export interface Turn {
  ts: number;
  sessionId: string;
  project: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface FileCache {
  size: number;
  turns: Turn[];
}

// Transcripts are append-only, so each refresh reads just the new bytes.
const cache = new Map<string, FileCache>();

function listTranscripts(): string[] {
  const out: string[] = [];
  let projects: string[];
  try {
    projects = fs.readdirSync(PROJECTS);
  } catch {
    return out;
  }
  for (const project of projects) {
    const dir = path.join(PROJECTS, project);
    try {
      for (const file of fs.readdirSync(dir)) {
        if (file.endsWith(".jsonl")) out.push(path.join(dir, file));
      }
    } catch {
      /* unreadable project dir */
    }
  }
  return out;
}

function parse(chunk: string, project: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of chunk.split("\n")) {
    if (!line || line.charCodeAt(0) !== 123 /* { */) continue;
    // Cheap reject before the JSON parse: most lines are not assistant replies.
    if (!line.includes('"usage"')) continue;
    try {
      const d = JSON.parse(line) as {
        type?: string;
        timestamp?: string;
        sessionId?: string;
        isSidechain?: boolean;
        message?: {
          model?: string;
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
        };
      };
      if (d.type !== "assistant" || !d.message?.usage || !d.timestamp) continue;
      const model = d.message.model ?? "";
      // Synthetic entries carry no real model call.
      if (!model || model === "<synthetic>") continue;
      const ts = Date.parse(d.timestamp);
      if (Number.isNaN(ts)) continue;

      const u = d.message.usage;
      turns.push({
        ts,
        sessionId: d.sessionId ?? "",
        project,
        model,
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      });
    } catch {
      /* half-written last line: it will be read again next refresh */
    }
  }
  return turns;
}

/**
 * Every model call Claude Code has made on this machine — terminal sessions and
 * Office desks alike, since both write the same transcripts.
 */
export function readAllTurns(sinceMs?: number): Turn[] {
  const cutoff = sinceMs ?? 0;
  const all: Turn[] = [];

  for (const file of listTranscripts()) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    // A file untouched since the cutoff cannot hold turns inside the window.
    if (cutoff && stat.mtimeMs < cutoff && !cache.has(file)) continue;

    const project = path.basename(path.dirname(file));
    const known = cache.get(file);

    if (known && stat.size === known.size) {
      all.push(...known.turns);
      continue;
    }

    try {
      if (known && stat.size > known.size) {
        // Read only what was appended.
        const fd = fs.openSync(file, "r");
        const length = stat.size - known.size;
        const buf = Buffer.allocUnsafe(length);
        fs.readSync(fd, buf, 0, length, known.size);
        fs.closeSync(fd);
        const turns = [...known.turns, ...parse(buf.toString("utf8"), project)];
        cache.set(file, { size: stat.size, turns });
        all.push(...turns);
      } else {
        const turns = parse(fs.readFileSync(file, "utf8"), project);
        cache.set(file, { size: stat.size, turns });
        all.push(...turns);
      }
    } catch {
      /* skip unreadable transcript */
    }
  }

  return cutoff ? all.filter((t) => t.ts >= cutoff) : all;
}
