import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAllTurns, type Turn } from "./transcripts";

const STORE = path.join(os.homedir(), ".lorenzo-office");

/** How far back the report looks. */
const HISTORY_MS = 30 * 86400_000;

/**
 * A pause longer than this is the user being away, not the agent working, so it
 * does not count towards "hours worked".
 */
const IDLE_GAP_MS = 5 * 60_000;

export interface Bucket {
  label: string;
  date: string;
  durationMs: number;
  turns: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
}

/** A rolling window, matching how Claude Code's own limits are measured. */
export interface Window {
  label: string;
  workedMs: number;
  percent: number;
  turns: number;
  tokens: number;
  resetAt: number | null;
  windowMs: number;
}

export interface UsageReport {
  fiveHour: Window;
  weekly: Window;
  today: Bucket;
  week: Bucket;
  total: Bucket;
  days: Bucket[];
  byModel: { model: string; turns: number; tokens: number; durationMs: number }[];
  byDesk: { deskId: string; deskName: string; turns: number; durationMs: number; tokens: number }[];
  firstEntry: number | null;
  lastEntry: number | null;
}

function tokensOf(t: Turn) {
  return t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheCreationTokens;
}

function localDay(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyBucket(label: string, date: string): Bucket {
  return {
    label,
    date,
    durationMs: 0,
    turns: 0,
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
  };
}

/**
 * Time actually spent working, derived from the gaps between consecutive turns
 * of the same session. Transcripts record no duration, so the gap is the signal;
 * long pauses are clipped so lunch does not count as work.
 */
function activeTime(turns: Turn[]): Map<Turn, number> {
  const bySession = new Map<string, Turn[]>();
  for (const t of turns) {
    const list = bySession.get(t.sessionId);
    if (list) list.push(t);
    else bySession.set(t.sessionId, [t]);
  }

  const credit = new Map<Turn, number>();
  for (const list of bySession.values()) {
    list.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < list.length; i++) {
      const previous = list[i - 1];
      // The first turn of a session gets a nominal slice; the rest get their gap.
      const gap = previous ? list[i].ts - previous.ts : 20_000;
      credit.set(list[i], Math.min(Math.max(gap, 0), IDLE_GAP_MS));
    }
  }
  return credit;
}

/** Office desks, so a sessionId can be shown under the desk's name. */
function deskNames(): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  try {
    const data = JSON.parse(fs.readFileSync(path.join(STORE, "desks.json"), "utf8")) as {
      id: string;
      name: string;
      sessionId: string | null;
    }[];
    for (const d of data) if (d.sessionId) map.set(d.sessionId, { id: d.id, name: d.name });
  } catch {
    /* no desks yet */
  }
  return map;
}

export function buildReport(now = Date.now()): UsageReport {
  const turns = readAllTurns(now - HISTORY_MS);
  const credit = activeTime(turns);
  const desks = deskNames();

  const todayKey = localDay(now);
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) dayKeys.push(localDay(now - i * 86400_000));
  const weekSet = new Set(dayKeys);

  const today = emptyBucket("Hoje", todayKey);
  const week = emptyBucket("7 dias", dayKeys[0]);
  const total = emptyBucket("Total", "");
  const days = new Map(dayKeys.map((k) => [k, emptyBucket(k, k)]));

  const models = new Map<string, { turns: number; tokens: number; durationMs: number }>();
  const bySession = new Map<string, { name: string; turns: number; durationMs: number; tokens: number }>();

  let first: number | null = null;
  let last: number | null = null;

  const add = (b: Bucket, t: Turn, ms: number) => {
    b.durationMs += ms;
    b.turns += 1;
    b.tokens += tokensOf(t);
    b.inputTokens += t.inputTokens;
    b.outputTokens += t.outputTokens;
    b.cacheTokens += t.cacheReadTokens + t.cacheCreationTokens;
  };

  for (const t of turns) {
    const ms = credit.get(t) ?? 0;
    const key = localDay(t.ts);

    add(total, t, ms);
    if (key === todayKey) add(today, t, ms);
    if (weekSet.has(key)) {
      add(week, t, ms);
      add(days.get(key)!, t, ms);
    }

    const m = models.get(t.model) ?? { turns: 0, tokens: 0, durationMs: 0 };
    m.turns += 1;
    m.tokens += tokensOf(t);
    m.durationMs += ms;
    models.set(t.model, m);

    const desk = desks.get(t.sessionId);
    const label = desk?.name ?? (t.project.replace(/^-Users-[^-]+-?/, "") || "terminal");
    const id = desk?.id ?? t.sessionId.slice(0, 8);
    const s = bySession.get(id) ?? { name: label, turns: 0, durationMs: 0, tokens: 0 };
    s.turns += 1;
    s.durationMs += ms;
    s.tokens += tokensOf(t);
    bySession.set(id, s);

    if (first === null || t.ts < first) first = t.ts;
    if (last === null || t.ts > last) last = t.ts;
  }

  const window = (label: string, windowMs: number): Window => {
    const since = now - windowMs;
    const inside = turns.filter((t) => t.ts >= since);
    let workedMs = 0;
    let tokens = 0;
    let firstTs: number | null = null;
    for (const t of inside) {
      workedMs += credit.get(t) ?? 0;
      tokens += tokensOf(t);
      if (firstTs === null || t.ts < firstTs) firstTs = t.ts;
    }
    return {
      label,
      workedMs,
      percent: Math.min(100, Math.round((workedMs / windowMs) * 100)),
      turns: inside.length,
      tokens,
      resetAt: firstTs === null ? null : firstTs + windowMs,
      windowMs,
    };
  };

  return {
    fiveHour: window("5 horas", 5 * 3600_000),
    weekly: window("Semana", 7 * 86400_000),
    today,
    week,
    total,
    days: dayKeys.map((k) => days.get(k)!),
    byModel: [...models.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.turns - a.turns),
    byDesk: [...bySession.entries()]
      .map(([deskId, v]) => ({ deskId, deskName: v.name, turns: v.turns, durationMs: v.durationMs, tokens: v.tokens }))
      .sort((a, b) => b.durationMs - a.durationMs),
    firstEntry: first,
    lastEntry: last,
  };
}
