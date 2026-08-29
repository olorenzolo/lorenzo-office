"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceState {
  configured: boolean;
  voiceId: string;
  stability: number;
  similarityBoost: number;
  speed: number;
  voices: { id: string; name: string; category: string; preview: string | null }[];
  error: string | null;
}

/**
 * One audio element for the whole app: starting a new line must interrupt the
 * previous one, never overlap it.
 */
let current: HTMLAudioElement | null = null;

export function useVoice() {
  const [state, setState] = useState<VoiceState | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    fetch("/api/voice")
      .then((r) => r.json())
      .then(setState)
      .catch(() => undefined);
    try {
      setAuto(localStorage.getItem("lorenzo-office:autospeak") === "1");
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggleAuto = useCallback((on: boolean) => {
    setAuto(on);
    try {
      localStorage.setItem("lorenzo-office:autospeak", on ? "1" : "0");
    } catch {
      /* storage blocked */
    }
  }, []);

  const stop = useCallback(() => {
    current?.pause();
    current = null;
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    async (id: string, text: string) => {
      if (speakingId === id) {
        stop();
        return;
      }
      stop();
      setSpeakingId(id);
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(await res.text());
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeakingId((s) => (s === id ? null : s));
        };
        await audio.play();
      } catch {
        setSpeakingId(null);
      }
    },
    [speakingId, stop],
  );

  return { state, setState, speak, stop, speakingId, auto, toggleAuto };
}

/** Speaker button shown on every finished assistant reply. */
export function SpeakButton({
  id,
  text,
  speaking,
  onSpeak,
}: {
  id: string;
  text: string;
  speaking: boolean;
  onSpeak: (id: string, text: string) => void;
}) {
  return (
    <button
      className={`speak-btn${speaking ? " on" : ""}`}
      onClick={() => onSpeak(id, text)}
      title={speaking ? "Parar" : "Ouvir"}
    >
      {speaking ? "◼" : "▶"}
    </button>
  );
}

interface SettingsProps {
  onClose: () => void;
}

export function VoiceSettings({ onClose }: SettingsProps) {
  const [state, setState] = useState<VoiceState | null>(null);
  const [saving, setSaving] = useState(false);
  const preview = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => {
    fetch("/api/voice")
      .then((r) => r.json())
      .then(setState)
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture phase: an extension in this browser eats keydown before it lands.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  const save = async (patch: Partial<VoiceState>) => {
    setSaving(true);
    await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    load();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">Voz</div>

        <div className="dialog-body">
          {!state ? (
            <div className="notice">carregando…</div>
          ) : !state.configured ? (
            <>
              <div className="notice">Nenhuma chave da ElevenLabs configurada.</div>
              <div className="field">
                <label>Como conectar sua conta</label>
                <ol className="md-list" style={{ fontSize: 12.5 }}>
                  <li>
                    Pegue a chave em <code>elevenlabs.io</code> → seu perfil → <b>API Keys</b>
                  </li>
                  <li>
                    Cole no arquivo <code>~/.lorenzo-office/config.json</code>, no campo{" "}
                    <code>elevenlabs.apiKey</code>
                  </li>
                  <li>Recarregue esta página</li>
                </ol>
                <div className="notice" style={{ fontSize: 11 }}>
                  O arquivo fica fora do repositório e a chave nunca chega ao navegador — só o
                  áudio já pronto.
                </div>
              </div>
            </>
          ) : (
            <>
              {state.error && <div className="error-line">{state.error}</div>}

              <div className="field">
                <label>Voz ({state.voices.length} disponíveis na sua conta)</label>
                <select
                  value={state.voiceId}
                  onChange={(e) => save({ voiceId: e.target.value })}
                  disabled={saving}
                >
                  {state.voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.category ? ` · ${v.category}` : ""}
                    </option>
                  ))}
                </select>
                {state.voices.find((v) => v.id === state.voiceId)?.preview && (
                  <button
                    className="btn sm"
                    onClick={() => {
                      const url = state.voices.find((v) => v.id === state.voiceId)!.preview!;
                      preview.current?.pause();
                      preview.current = new Audio(url);
                      void preview.current.play();
                    }}
                  >
                    ouvir amostra
                  </button>
                )}
              </div>

              <div className="field">
                <label>Estabilidade — {state.stability.toFixed(2)} (menor = mais expressivo)</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={state.stability}
                  onChange={(e) => setState({ ...state, stability: Number(e.target.value) })}
                  onMouseUp={() => save({ stability: state.stability })}
                />
              </div>

              <div className="field">
                <label>Fidelidade ao timbre — {state.similarityBoost.toFixed(2)}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={state.similarityBoost}
                  onChange={(e) => setState({ ...state, similarityBoost: Number(e.target.value) })}
                  onMouseUp={() => save({ similarityBoost: state.similarityBoost })}
                />
              </div>

              <div className="field">
                <label>Velocidade — {state.speed.toFixed(2)}x</label>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={state.speed}
                  onChange={(e) => setState({ ...state, speed: Number(e.target.value) })}
                  onMouseUp={() => save({ speed: state.speed })}
                />
              </div>

              <div className="notice" style={{ fontSize: 11 }}>
                Áudios já gerados ficam em cache, então reouvir a mesma resposta não gasta
                créditos de novo.
              </div>
            </>
          )}
        </div>

        <div className="dialog-foot">
          <button className="btn ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
