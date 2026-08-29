"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeskSummary } from "@/lib/types";
import type { Item } from "@/lib/timeline";
import Brain from "./Brain";
import UsageWidget from "./UsageWidget";

const KEY = "lorenzo-office:left-width";
const MIN = 340;
const MAX = 1400;
const DEFAULT = 860;

interface Props {
  desks: DeskSummary[];
  items: Item[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewDesk: () => void;
  onOpenUsage: () => void;
}

/**
 * Everything that is "the office": the pixel floor, who is at which desk, and
 * how much has been used. All of it stays on screen while the chat runs beside it.
 */
export default function LeftPanel({ desks, items, activeId, onSelect, onNewDesk, onOpenUsage }: Props) {
  // Starts at the default so server and first client render agree; the stored
  // width is applied right after, avoiding both a hydration mismatch and a flash.
  const [width, setWidth] = useState(DEFAULT);
  const dragging = useRef(false);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(KEY));
      if (stored >= MIN && stored <= MAX) setWidth(stored);
    } catch {
      /* blocked storage: the default is fine */
    }
  }, []);

  const startDrag = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    const move = (e: MouseEvent) => {
      if (dragging.current) setWidth(Math.min(MAX, Math.max(MIN, e.clientX)));
    };
    const stop = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      setWidth((w) => {
        try {
          localStorage.setItem(KEY, String(w));
        } catch {
          /* nothing to do */
        }
        return w;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  }, []);

  const working = desks.filter((d) => d.status === "thinking").length;
  const waiting = desks.filter((d) => d.status === "waiting_permission").length;

  return (
    <aside className="left-panel" style={{ width }}>
      <div className="brand">
        <span className="brand-dot" />
        <div>
          <div className="brand-name">Lorenzo · Office</div>
          <div className="brand-sub">
            {desks.length} mesas · {working} rodando{waiting ? ` · ${waiting} esperando` : ""}
          </div>
        </div>
      </div>

      <div className="panel-office">
        <Brain desks={desks} active={desks.find((d) => d.id === activeId) ?? null} items={items} />
      </div>

      <div className="panel-desks">
        {desks.map((desk) => (
          <button
            key={desk.id}
            className={`desk-chip${desk.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(desk.id)}
            title={desk.cwd.replace(/^\/Users\/[^/]+/, "~")}
          >
            <span className={`dot ${desk.status}`} />
            <span className="chip-name">{desk.name}</span>
            {desk.unread > 0 && desk.id !== activeId && <span className="badge">{desk.unread}</span>}
          </button>
        ))}
        <button className="desk-chip new" onClick={onNewDesk} title="Nova mesa (⌘K)">
          + mesa
        </button>
      </div>

      <UsageWidget onOpen={onOpenUsage} />

      <div className="panel-grip" onMouseDown={startDrag} title="Arraste para redimensionar" />
    </aside>
  );
}
