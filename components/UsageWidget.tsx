"use client";

import { useEffect, useState } from "react";
import type { UsageReport, Window } from "@/lib/usage";

function remaining(resetAt: number | null, now: number): string {
  if (!resetAt) return "—";
  const ms = resetAt - now;
  if (ms <= 0) return "agora";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (days > 0) return `${days}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

function resetClock(resetAt: number | null): string {
  if (!resetAt) return "—";
  return new Date(resetAt).toLocaleString("pt-BR", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function worked(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m}min` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Green below half, amber past it, red near the top. */
function tone(percent: number): string {
  if (percent >= 80) return "hot";
  if (percent >= 45) return "warm";
  return "cool";
}

function Card({ w, now }: { w: Window; now: number }) {
  const segments = 8;
  const filled = Math.round((w.percent / 100) * segments);

  return (
    <div className={`uw-card ${tone(w.percent)}`}>
      <span className="uw-label">{w.label}</span>
      <span className="uw-percent">{w.percent}%</span>
      <div className="uw-bar">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={`uw-seg${i < filled ? " on" : ""}`} />
        ))}
      </div>
      <span className="uw-reset">reseta · {resetClock(w.resetAt)}</span>
      <span className="uw-remaining">{remaining(w.resetAt, now)}</span>
      <span className="uw-worked">{worked(w.workedMs)} trabalhados</span>
    </div>
  );
}

export default function UsageWidget({ onOpen }: { onOpen: () => void }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage")
        .then((r) => r.json())
        .then((d: UsageReport) => {
          if (!alive) return;
          setReport(d);
          setUpdatedAt(Date.now());
        })
        .catch(() => undefined);
    load();
    const poll = setInterval(load, 30000);
    // The countdown has to tick even when the numbers themselves have not moved.
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (!report) return null;

  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 60000)) : 0;

  return (
    <button className="uw" onClick={onOpen} title="Abrir o monitor completo">
      <div className="uw-head">
        <span className="uw-title">USO</span>
        <span className="uw-ago">{ago === 0 ? "agora" : `há ${ago}min`}</span>
      </div>
      <div className="uw-cards">
        <Card w={report.fiveHour} now={now} />
        <Card w={report.weekly} now={now} />
      </div>
    </button>
  );
}
