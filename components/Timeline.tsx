"use client";

import { useEffect, useRef } from "react";
import type { Item } from "@/lib/timeline";
import ToolCard, { toolSummary } from "./ToolCard";
import Markdown from "./Markdown";
import { AttachmentList } from "./Attachments";
import { SpeakButton } from "./Voice";

interface Props {
  items: Item[];
  billed: boolean;
  voiceOn: boolean;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
  onPermission: (requestId: string, decision: "allow" | "always" | "deny") => void;
}

export default function Timeline({ items, billed, voiceOn, speakingId, onSpeak, onPermission }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Follow the stream, but stop following the moment the user scrolls up.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onScroll = () => {
      stickRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    };
    box.addEventListener("scroll", onScroll);
    return () => box.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  return (
    <div className="timeline" ref={boxRef}>
      <div className="stream">
        {items.map((item) => (
          <Block
            key={item.key}
            item={item}
            billed={billed}
            voiceOn={voiceOn}
            speakingId={speakingId}
            onSpeak={onSpeak}
            onPermission={onPermission}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function Block({
  item,
  billed,
  voiceOn,
  speakingId,
  onSpeak,
  onPermission,
}: {
  item: Item;
  billed: boolean;
  voiceOn: boolean;
  speakingId: string | null;
  onSpeak: Props["onSpeak"];
  onPermission: Props["onPermission"];
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="turn">
          <div className="msg-user">
            {item.attachments.length > 0 && <AttachmentList attachments={item.attachments} />}
            {item.text && <div className="msg-user-text">{item.text}</div>}
          </div>
        </div>
      );

    case "text":
      return (
        <div className="turn">
          {item.agent && <div className="agent-tag">subagent</div>}
          <div className="msg-assistant">
            <Markdown text={item.text} />
            {voiceOn && item.text.trim().length > 12 && (
              <SpeakButton
                id={item.key}
                text={item.text}
                speaking={speakingId === item.key}
                onSpeak={onSpeak}
              />
            )}
          </div>
        </div>
      );

    case "thinking":
      return (
        <div className="turn">
          <div className="thinking">{item.text}</div>
        </div>
      );

    case "tool":
      return <ToolCard tool={item} />;

    case "permission":
      return (
        <div className={`perm${item.decision ? " resolved" : ""}`}>
          <div className="perm-title">
            {item.decision
              ? item.decision === "deny"
                ? `Negado · ${item.tool}`
                : `Permitido · ${item.tool}${item.decision === "always" ? " (sempre)" : ""}`
              : `Permissão · ${item.tool}`}
          </div>
          <div className="perm-body">
            {toolSummary(item.tool, item.input) || JSON.stringify(item.input, null, 2)}
          </div>
          {!item.decision && (
            <div className="perm-actions">
              <button className="btn primary sm" onClick={() => onPermission(item.id, "allow")}>
                Permitir
              </button>
              <button className="btn sm" onClick={() => onPermission(item.id, "always")}>
                Sempre nesta mesa
              </button>
              <button className="btn sm danger" onClick={() => onPermission(item.id, "deny")}>
                Negar
              </button>
            </div>
          )}
        </div>
      );

    case "result":
      return (
        <div className="result-line">
          <span>{(item.durationMs / 1000).toFixed(1)}s</span>
          <span>{item.turns} turnos</span>
          {billed && item.costUsd > 0 && <span>${item.costUsd.toFixed(4)}</span>}
          {item.isError && <span style={{ color: "var(--red)" }}>{item.subtype}</span>}
        </div>
      );

    case "error":
      return <div className="error-line">{item.message}</div>;

    case "notice":
      return <div className="notice">{item.text}</div>;
  }
}
