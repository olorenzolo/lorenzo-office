"use client";

import { useEffect, useState } from "react";
import { browse } from "@/lib/client";
import type { PermissionMode } from "@/lib/types";

export const ROLES: { label: string; role: string }[] = [
  { label: "Sem especialidade", role: "" },
  {
    label: "Gestor de tráfego",
    role: "Você é o gestor de tráfego do Lorenzo. Foque em Meta Ads: campanhas, CPL, criativos e as skills da agência (subir-campanha, relatorio-semanal). Seja direto e traga números.",
  },
  {
    label: "Dev / infra",
    role: "Você é o dev do Lorenzo. Foque em código, deploys na Vercel, Supabase e automações. Prefira CLI e API a interfaces gráficas.",
  },
  {
    label: "Analista de dados",
    role: "Você é o analista do Lorenzo. Foque em leads, planilhas, Supabase e relatórios. Sempre confira os números na fonte antes de concluir.",
  },
  {
    label: "Copy / conteúdo",
    role: "Você é o redator do Lorenzo. Foque em copy de anúncio, landing page e conteúdo de Instagram, em português do Brasil.",
  },
  {
    label: "Editor de mídia",
    role: "Você é o editor de mídia do Lorenzo. Trabalhe com os arquivos de vídeo, áudio e imagem que ele anexar, usando ffmpeg e ffprobe para inspecionar, cortar, converter e extrair frames ou áudio.",
  },
];

interface Props {
  onClose: () => void;
  onCreate: (body: {
    name: string;
    cwd: string;
    model: string;
    role: string;
    permissionMode: PermissionMode;
  }) => void;
  defaultCwd: string;
}

export default function NewDeskDialog({ onClose, onCreate, defaultCwd }: Props) {
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState("opus");
  const [roleIndex, setRoleIndex] = useState(0);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("default");
  const [dir, setDir] =
    useState<{ path: string; parent: string | null; entries: { name: string; path: string }[] }>();

  useEffect(() => {
    browse(cwd)
      .then(setDir)
      .catch(() => undefined);
  }, [cwd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">Nova mesa</div>
        <div className="dialog-body">
          <div className="field">
            <label>Nome</label>
            <input
              className="input"
              autoFocus
              placeholder="Ex: Campanhas AndroClinic"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Especialidade</label>
            <select value={roleIndex} onChange={(e) => setRoleIndex(Number(e.target.value))}>
              {ROLES.map((r, i) => (
                <option key={r.label} value={i}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Pasta de trabalho</label>
            <input className="input mono" value={cwd} onChange={(e) => setCwd(e.target.value)} />
            <div className="picker">
              {dir?.parent && <button onClick={() => setCwd(dir.parent!)}>../</button>}
              {dir?.entries.map((e) => (
                <button key={e.path} onClick={() => setCwd(e.path)}>
                  {e.name}/
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Modelo</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="opus">Opus 5</option>
                <option value="sonnet">Sonnet 5</option>
                <option value="haiku">Haiku 4.5</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Permissões</label>
              <select
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              >
                <option value="default">Perguntar antes</option>
                <option value="acceptEdits">Aceitar edições</option>
                <option value="bypassPermissions">Autonomia total</option>
                <option value="plan">Só planejar</option>
              </select>
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            onClick={() =>
              onCreate({
                name: name.trim() || ROLES[roleIndex].label,
                cwd,
                model,
                role: ROLES[roleIndex].role,
                permissionMode,
              })
            }
          >
            Abrir mesa
          </button>
        </div>
      </div>
    </div>
  );
}
