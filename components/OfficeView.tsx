"use client";

import { useEffect, useState } from "react";

/**
 * The pixel office, embedded. It is a separate service, so the panel has to
 * cope with it being down and say so instead of showing a blank frame.
 */
export default function OfficeView({ active, sessionId }: { active: boolean; sessionId?: string | null }) {
  const [info, setInfo] = useState<{ url: string; up: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const check = () =>
      fetch("/api/viz")
        .then((r) => r.json())
        .then((d) => alive && setInfo(d))
        .catch(() => alive && setInfo({ url: "", up: false }));
    check();
    // While it is down, keep looking: launchd may still be starting it.
    const timer = setInterval(() => {
      if (!info?.up) check();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, info?.up]);

  if (!active) return null;

  if (!info) return <div className="viz-msg">carregando o escritório…</div>;

  if (!info.up) {
    return (
      <div className="viz-msg">
        <p>O escritório visual não está respondendo.</p>
        <p className="mono" style={{ fontSize: 11 }}>
          Ele roda como serviço próprio (porta 3000). Se acabou de ligar o Mac, aguarde alguns
          segundos.
        </p>
        <button className="btn sm" onClick={() => setReloadKey((k) => k + 1)}>
          Tentar de novo
        </button>
      </div>
    );
  }

  // The session rides in the hash, so switching desks re-points the pixel
  // office without reloading the whole frame.
  const hash = ["embed=1", sessionId ? `session=${encodeURIComponent(sessionId)}` : ""]
    .filter(Boolean)
    .join("&");
  const src = `${info.url}#${hash}`;

  return (
    <iframe
      key={reloadKey}
      className="viz-frame"
      src={src}
      title="Escritório"
      allow="clipboard-read; clipboard-write"
    />
  );
}
