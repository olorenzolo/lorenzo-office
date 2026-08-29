"use client";

import { useEffect, useState } from "react";
import type { UsageReport } from "@/lib/usage";

function hours(ms: number): string {
  if (ms <= 0) return "—";
  // Turns are often seconds long; rounding those to "0min" hides real work.
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m}min` : `${h}h ${String(m).padStart(2, "0")}min`;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  return local.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

const MODEL_LABEL: Record<string, string> = {
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

export default function UsageMonitor({ billed, onClose }: { billed: boolean; onClose: () => void }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/usage")
        .then((r) => r.json())
        .then(setReport)
        .catch(() => setError("não consegui ler o uso"));
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const peak = report ? Math.max(1, ...report.days.map((d) => d.durationMs)) : 1;
  const topModel = report?.byModel[0];

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          Monitor de uso
          <button className="btn ghost sm" style={{ float: "right" }} onClick={onClose}>
            fechar
          </button>
        </div>

        <div className="dialog-body">
          {error && <div className="error-line">{error}</div>}
          {!report && !error && <div className="notice">carregando…</div>}

          {report && report.total.turns === 0 && (
            <div className="notice">
              Nenhum turno registrado ainda. Os números aparecem conforme você trabalha nas mesas.
            </div>
          )}

          {report && report.total.turns > 0 && (
            <>
              <div className="stats">
                <Stat label="Horas trabalhadas" value={hours(report.total.durationMs)} note="tempo total" />
                <Stat label="Hoje" value={hours(report.today.durationMs)} note={`${report.today.turns} turnos`} />
                <Stat label="Esta semana" value={hours(report.week.durationMs)} note={`${report.week.turns} turnos`} />
                <Stat
                  label="Tokens"
                  value={compact(report.total.tokens)}
                  note={`${compact(report.total.outputTokens)} gerados · ${compact(report.total.cacheTokens)} de cache`}
                />
                <Stat
                  label="Modelo mais usado"
                  value={topModel ? (MODEL_LABEL[topModel.model] ?? topModel.model) : "—"}
                  note={topModel ? `${topModel.turns} turnos` : ""}
                />
                <Stat
                  label="Turnos"
                  value={String(report.total.turns)}
                  note={`${report.week.turns} nos 7 dias`}
                />
              </div>

              <div className="field">
                <label>Uso diário — últimos 7 dias</label>
                <div className="bars">
                  {report.days.map((d) => (
                    <div className="bar-col" key={d.date} title={`${d.date}: ${hours(d.durationMs)}`}>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ height: `${Math.round((d.durationMs / peak) * 100)}%` }}
                        />
                      </div>
                      <span className="bar-label">{dayLabel(d.date)}</span>
                      <span className="bar-value">{d.durationMs ? hours(d.durationMs) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Por modelo</label>
                <table className="md-table">
                  <thead>
                    <tr>
                      <th>Modelo</th>
                      <th>Turnos</th>
                      <th>Tokens</th>
                      <th>Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byModel.map((m) => (
                      <tr key={m.model}>
                        <td>{MODEL_LABEL[m.model] ?? m.model}</td>
                        <td>{m.turns}</td>
                        <td>{compact(m.tokens)}</td>
                        <td>{hours(m.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.byDesk.length > 0 && (
                <div className="field">
                  <label>Por mesa</label>
                  <table className="md-table">
                    <thead>
                      <tr>
                        <th>Mesa</th>
                        <th>Turnos</th>
                        <th>Tempo</th>
                        <th>Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byDesk.slice(0, 8).map((d) => (
                        <tr key={d.deskId}>
                          <td>{d.deskName || d.deskId}</td>
                          <td>{d.turns}</td>
                          <td>{hours(d.durationMs)}</td>
                          <td>{compact(d.tokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!billed && (
                <div className="notice">
                  Você está na assinatura, então não há cobrança por turno — o custo é omitido de
                  propósito.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
