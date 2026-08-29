"use client";

import { useEffect, useState } from "react";
import type { GitStatus } from "@/lib/git";

/**
 * Repository state for the desk's working directory, as a topbar pill. Silent
 * when the desk is not inside a repository.
 */
export default function GitPill({ deskId, onOpen }: { deskId: string; onOpen: () => void }) {
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/git?desk=${deskId}`)
        .then((r) => r.json())
        .then((d: GitStatus) => alive && setStatus(d))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [deskId]);

  if (!status?.repo) return null;

  const dirty = status.files.length;

  return (
    <button
      className={`pill git-pill${dirty > 0 ? " dirty" : ""}`}
      onClick={onOpen}
      title="Controle de versão"
    >
      <span className="git-pill-branch">⎇ {status.branch ?? "—"}</span>
      {dirty > 0 && <span className="git-pill-count">{dirty}</span>}
      {status.ahead > 0 && <span className="git-pill-ahead">↑{status.ahead}</span>}
      {status.behind > 0 && <span className="git-pill-behind">↓{status.behind}</span>}
    </button>
  );
}
