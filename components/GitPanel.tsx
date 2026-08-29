"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Commit, GitFile, GitStatus } from "@/lib/git";

type Busy = null | "stage" | "commit" | "pull" | "push" | "sync" | "discard";

async function call<T>(deskId: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/git?desk=${deskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "falhou");
  return data;
}

/** Colours a unified diff without pulling in a syntax highlighter. */
function Diff({ text }: { text: string }) {
  const lines = text.split("\n").slice(0, 900);
  return (
    <pre className="git-diff">
      {lines.map((l, i) => {
        const cls = l.startsWith("+++") || l.startsWith("---")
          ? "d-meta"
          : l.startsWith("@@")
            ? "d-hunk"
            : l.startsWith("+")
              ? "d-add"
              : l.startsWith("-")
                ? "d-del"
                : l.startsWith("diff ") || l.startsWith("index ")
                  ? "d-meta"
                  : "";
        return (
          <span key={i} className={cls}>
            {l || " "}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

interface Props {
  deskId: string;
  deskName: string;
  onClose: () => void;
}

export default function GitPanel({ deskId, deskName, onClose }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [selected, setSelected] = useState<GitFile | null>(null);
  const [diff, setDiff] = useState<string>("");
  const [messageText, setMessageText] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/git?desk=${deskId}`);
      setStatus((await res.json()) as GitStatus);
    } catch {
      setError("não consegui ler o repositório");
    }
  }, [deskId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 6000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture phase: an extension in this browser eats keydown before it lands.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  useEffect(() => {
    if (tab !== "history" || commits.length) return;
    void call<{ commits: Commit[] }>(deskId, { action: "log", limit: 40 })
      .then((d) => setCommits(d.commits))
      .catch((e: Error) => setError(e.message));
  }, [tab, commits.length, deskId]);

  useEffect(() => {
    if (!selected) {
      setDiff("");
      return;
    }
    void call<{ diff: string }>(deskId, {
      action: "diff",
      path: selected.path,
      staged: selected.staged && !selected.unstaged,
    })
      .then((d) => setDiff(d.diff))
      .catch((e: Error) => setDiff(`erro: ${e.message}`));
  }, [selected, deskId]);

  const act = async (kind: Busy, body: Record<string, unknown>, okNote?: string) => {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      const data = await call<{ status?: GitStatus }>(deskId, body);
      if (data.status) setStatus(data.status);
      if (okNote) setNote(okNote);
      setCommits([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const staged = useMemo(() => status?.files.filter((f) => f.staged) ?? [], [status]);
  const changed = useMemo(() => status?.files.filter((f) => !f.staged) ?? [], [status]);

  const fileRow = (f: GitFile, action: "stage" | "unstage") => (
    <div className={`git-file${selected?.path === f.path ? " on" : ""}`} key={f.path + action}>
      <button className="git-file-main" onClick={() => setSelected(f)}>
        <span className={`git-code c-${f.code.replace(/[^A-Z?]/g, "").toLowerCase() || "mod"}`}>
          {f.code.replace(/\./g, "")}
        </span>
        <span className="git-path">{f.path}</span>
        <span className="git-label">{f.label}</span>
      </button>
      <button
        className="btn ghost sm"
        title={action === "stage" ? "Preparar" : "Tirar da preparação"}
        onClick={() => act("stage", { action, paths: [f.path] })}
      >
        {action === "stage" ? "+" : "−"}
      </button>
    </div>
  );

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog wide git" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head git-head">
          <span>Controle de versão</span>
          {status?.repo && (
            <span className="git-branch">
              ⎇ {status.branch ?? "sem branch"}
              {status.ahead > 0 && <b className="ahead"> ↑{status.ahead}</b>}
              {status.behind > 0 && <b className="behind"> ↓{status.behind}</b>}
              {!status.upstream && <i className="git-warn"> sem upstream</i>}
            </span>
          )}
          <span className="spacer" />
          {status?.githubUrl && (
            <a className="btn ghost sm" href={status.githubUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
          )}
          <button className="btn ghost sm" onClick={onClose}>
            fechar
          </button>
        </div>

        {!status ? (
          <div className="dialog-body">
            <div className="notice">lendo o repositório…</div>
          </div>
        ) : !status.repo ? (
          <div className="dialog-body">
            <div className="notice">
              A pasta da mesa <b>{deskName}</b> não é um repositório git.
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Peça à mesa para rodar <code>git init</code> se quiser versionar aqui.
            </div>
          </div>
        ) : (
          <>
            <div className="git-tabs">
              <button className={`tab${tab === "changes" ? " on" : ""}`} onClick={() => setTab("changes")}>
                Mudanças {status.files.length > 0 && <b>{status.files.length}</b>}
              </button>
              <button className={`tab${tab === "history" ? " on" : ""}`} onClick={() => setTab("history")}>
                Histórico
              </button>
              <span className="spacer" />
              <button
                className="btn sm"
                disabled={busy !== null}
                onClick={() => act("pull", { action: "pull" }, "pull concluído")}
              >
                Pull
              </button>
              <button
                className="btn sm"
                disabled={busy !== null || !status.upstream || status.ahead === 0}
                onClick={() => act("push", { action: "push" }, "push concluído")}
              >
                Push{status.ahead > 0 ? ` (${status.ahead})` : ""}
              </button>
            </div>

            <div className="git-body">
              {tab === "changes" ? (
                <>
                  <div className="git-lists">
                    {status.clean && <div className="notice">Nada alterado — árvore limpa.</div>}

                    {staged.length > 0 && (
                      <>
                        <div className="section-label">Preparado ({staged.length})</div>
                        {staged.map((f) => fileRow(f, "unstage"))}
                      </>
                    )}

                    {changed.length > 0 && (
                      <>
                        <div className="section-label">Alterado ({changed.length})</div>
                        {changed.map((f) => fileRow(f, "stage"))}
                      </>
                    )}

                    {status.files.length > 0 && (
                      <div className="git-bulk">
                        <button
                          className="btn ghost sm"
                          disabled={busy !== null}
                          onClick={() =>
                            act("stage", { action: "stage", paths: status.files.map((f) => f.path) })
                          }
                        >
                          preparar tudo
                        </button>
                        <button
                          className="btn ghost sm danger"
                          disabled={busy !== null}
                          onClick={() => {
                            if (!confirm("Descartar TODAS as alterações? Isso não tem volta.")) return;
                            void act("discard", {
                              action: "discard",
                              paths: status.files.map((f) => f.path),
                            });
                          }}
                        >
                          descartar tudo
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="git-diff-pane">
                    {selected ? (
                      <>
                        <div className="git-diff-head">{selected.path}</div>
                        <Diff text={diff} />
                      </>
                    ) : (
                      <div className="notice" style={{ padding: 14 }}>
                        Escolha um arquivo para ver o diff.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="git-history">
                  {commits.length === 0 && <div className="notice">sem commits</div>}
                  {commits.map((c) => (
                    <div className="git-commit" key={c.hash}>
                      <a
                        className="git-hash"
                        href={status.githubUrl ? `${status.githubUrl}/commit/${c.hash}` : undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.short}
                      </a>
                      <span className="git-subject">{c.subject}</span>
                      <span className="git-meta">
                        {c.author} · {new Date(c.date).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dialog-foot git-foot">
              {error && <span className="git-error">{error}</span>}
              {note && !error && <span className="git-note">{note}</span>}
              <input
                className="input mono"
                placeholder="mensagem do commit"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <button
                className="btn primary"
                disabled={busy !== null || !messageText.trim() || status.clean}
                onClick={async () => {
                  await act("commit", { action: "commit", message: messageText, stageAll: true });
                  setMessageText("");
                }}
              >
                {busy === "commit" ? "…" : "Commit"}
              </button>
              <button
                className="btn"
                disabled={busy !== null}
                title="commit de tudo, depois pull e push"
                onClick={async () => {
                  if (messageText.trim() && !status.clean) {
                    await act("commit", { action: "commit", message: messageText, stageAll: true });
                    setMessageText("");
                  }
                  await act("sync", { action: "sync" }, "sincronizado");
                }}
              >
                {busy === "sync" ? "…" : "Sync"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
