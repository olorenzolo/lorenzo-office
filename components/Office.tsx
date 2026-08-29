"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  answerPermission,
  closeDesk,
  control,
  createDesk,
  listDesks,
  loadDesk,
  sendMessage,
  uploadFile,
} from "@/lib/client";
import type { Attachment, DeskSummary, OfficeEvent, PermissionMode } from "@/lib/types";
import { applyEvent, type Item } from "@/lib/timeline";
import Timeline from "./Timeline";
import NewDeskDialog from "./NewDeskDialog";
import { AttachmentTray, type Upload } from "./Attachments";
import UsageMonitor from "./UsageMonitor";
import GitPanel from "./GitPanel";
import GitPill from "./GitPill";
import LeftPanel from "./LeftPanel";

const PERMISSION_LABEL: Record<PermissionMode, string> = {
  default: "perguntar",
  acceptEdits: "aceitar edições",
  bypassPermissions: "autonomia total",
  plan: "só planejar",
};

export default function Office() {
  const [desks, setDesks] = useState<DeskSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Dead keys (á, ç, ã) put the browser in composition mode; an Enter that only
  // confirms an accent must reach the textarea instead of sending the message.
  // Stored as the start timestamp, not a boolean: a compositionend that never
  // arrives would otherwise disable Enter for the rest of the session.
  const composingSince = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const active = desks.find((d) => d.id === activeId) ?? null;

  const refreshDesks = useCallback(async () => {
    const { desks } = await listDesks();
    setDesks(desks);
    return desks;
  }, []);

  useEffect(() => {
    refreshDesks().then((list) => {
      if (list.length) setActiveId((current) => current ?? list[0].id);
    });
  }, [refreshDesks]);

  // Load history, then follow the desk's live event stream.
  useEffect(() => {
    if (!activeId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setItems([]);
    setAttachments([]);
    setUploads([]);
    setUploadError(null);

    loadDesk(activeId).then(({ events }) => {
      if (cancelled) return;
      setItems(events.reduce<Item[]>((acc, e) => applyEvent(acc, e), []));
    });

    const source = new EventSource(`/api/desks/${activeId}/stream`);
    source.onmessage = (msg) => {
      const payload = JSON.parse(msg.data) as OfficeEvent | { type: "hello"; desk: DeskSummary };
      if (payload.type === "hello") {
        setDesks((prev) => prev.map((d) => (d.id === payload.desk.id ? payload.desk : d)));
        return;
      }
      if (payload.type === "status" || payload.type === "result" || payload.type === "init") {
        void refreshDesks();
      }
      setItems((prev) => applyEvent(prev, payload));
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [activeId, refreshDesks]);

  // Keep sidebar status dots fresh even for desks that aren't open.
  useEffect(() => {
    const timer = setInterval(() => void refreshDesks(), 3000);
    return () => clearInterval(timer);
  }, [refreshDesks]);

  const attach = useCallback(
    async (files: File[]) => {
      if (!activeId || !files.length) return;
      setUploadError(null);
      const pending: Upload[] = files.map((f) => ({
        id: `${f.name}:${f.size}:${Math.random()}`,
        name: f.name,
        size: f.size,
      }));
      setUploads((prev) => [...prev, ...pending]);

      // Sequential: two large videos at once would fight for the same pipe.
      for (let i = 0; i < files.length; i++) {
        try {
          const saved = await uploadFile(activeId, files[i]);
          setAttachments((prev) => [...prev, saved]);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : "falha no upload");
        } finally {
          setUploads((prev) => prev.filter((u) => u.id !== pending[i].id));
        }
      }
    },
    [activeId],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if ((!text && !attachments.length) || !activeId || uploads.length > 0) return;
    setDraft("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(activeId, text, attachments);
    void refreshDesks();
  }, [draft, attachments, activeId, uploads.length, refreshDesks]);

  // Enter is handled from a window-level CAPTURE listener because an extension
  // in this browser stops propagation before the event reaches the textarea:
  // window capture fires, the element's own listener never does. preventDefault
  // still suppresses the newline from here.
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target !== textareaRef.current) return;
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      const recentlyComposing =
        composingSince.current > 0 && Date.now() - composingSince.current < 600;
      if (recentlyComposing) return;
      e.preventDefault();
      e.stopPropagation();
      void sendRef.current();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setDialogOpen(true);
      }
      if (e.key === "Escape" && active?.status === "thinking") {
        void control(active.id, "interrupt");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // A file dropped anywhere on the window attaches, like the terminal does.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
    };
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void attach(Array.from(e.dataTransfer.files));
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [attach]);

  // A screenshot pasted while the composer is not focused should still land.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      void attach(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [attach]);

  const onPermission = async (requestId: string, decision: "allow" | "always" | "deny") => {
    if (!activeId) return;
    await answerPermission(activeId, requestId, decision);
  };

  const working = useMemo(() => desks.filter((d) => d.status === "thinking").length, [desks]);
  const waiting = useMemo(() => desks.filter((d) => d.status === "waiting_permission").length, [desks]);

  const hint = uploadError
    ? uploadError
    : uploads.length > 0
      ? `enviando ${uploads.length} arquivo${uploads.length > 1 ? "s" : ""}…`
      : active?.status === "thinking"
        ? "trabalhando… Esc para parar"
        : active?.status === "waiting_permission"
          ? "aguardando sua permissão"
          : "Enter envia · cole ou arraste imagens, vídeos, áudios e arquivos";

  return (
    <div className="office">
      <LeftPanel
        desks={desks}
        items={items}
        activeId={activeId}
        onSelect={setActiveId}
        onNewDesk={() => setDialogOpen(true)}
        onOpenUsage={() => setUsageOpen(true)}
      />


      <main className={`main${dragging ? " dropping" : ""}`}>
        {dragging && <div className="drop-hint">Solte para anexar</div>}

        {active ? (
          <>
            <div className="topbar">
              <span className={`dot ${active.status}`} />
              <span className="topbar-title">{active.name}</span>
              <span className="topbar-cwd">{active.cwd.replace(/^\/Users\/[^/]+/, "~")}</span>

              <span className="spacer" />

              <GitPill deskId={active.id} onOpen={() => setGitOpen(true)} />

              {active.billed && active.totalCostUsd > 0 && (
                <span className="pill">${active.totalCostUsd.toFixed(3)}</span>
              )}

              <select
                className="pill"
                value={active.model}
                onChange={(e) => control(active.id, "model", e.target.value).then(() => refreshDesks())}
              >
                <option value="opus">opus</option>
                <option value="sonnet">sonnet</option>
                <option value="haiku">haiku</option>
              </select>

              <select
                className={`pill${active.permissionMode === "bypassPermissions" ? " warn" : ""}`}
                value={active.permissionMode}
                onChange={(e) =>
                  control(active.id, "permissionMode", e.target.value).then(() => refreshDesks())
                }
              >
                {(Object.keys(PERMISSION_LABEL) as PermissionMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {PERMISSION_LABEL[mode]}
                  </option>
                ))}
              </select>

              {active.status === "thinking" && (
                <button className="btn sm" onClick={() => control(active.id, "interrupt")}>
                  Parar
                </button>
              )}

              <button
                className="btn ghost sm"
                onClick={async () => {
                  if (!confirm(`Fechar a mesa "${active.name}"?`)) return;
                  await closeDesk(active.id);
                  const list = await refreshDesks();
                  setActiveId(list[0]?.id ?? null);
                }}
              >
                Fechar
              </button>
            </div>

            <Timeline items={items} billed={active.billed} onPermission={onPermission} />

            <div className="composer">
              <div className="composer-inner">
                <div className="composer-box">
                  <AttachmentTray
                    attachments={attachments}
                    uploads={uploads}
                    onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
                  />
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={draft}
                    placeholder={`Falar com ${active.name}…  (/ para skills)`}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
                    }}
                    onCompositionStart={() => {
                      composingSince.current = Date.now();
                    }}
                    onCompositionEnd={() => {
                      composingSince.current = 0;
                    }}
                    onKeyDown={(e) => {
                      // The native capture listener above normally handles this and
                      // stops propagation; this only runs if that one never fired.
                      if (e.key !== "Enter" || e.shiftKey) return;
                      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                      e.preventDefault();
                      void send();
                    }}
                  />
                  <div className="composer-bar">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        void attach(Array.from(e.target.files ?? []));
                        e.target.value = "";
                      }}
                    />
                    <button
                      className="btn ghost sm attach-btn"
                      onClick={() => fileInputRef.current?.click()}
                      title="Anexar arquivo"
                    >
                      +
                    </button>
                    <span className={`hint${uploadError ? " err" : ""}`}>{hint}</span>
                    <span className="spacer" />
                    <button
                      className="btn primary sm"
                      onClick={send}
                      disabled={(!draft.trim() && !attachments.length) || uploads.length > 0}
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">
            <h2>Escritório vazio</h2>
            <p>
              Abra uma mesa com <span className="kbd">⌘K</span> e coloque um agent pra trabalhar.
            </p>
            <button className="btn primary" onClick={() => setDialogOpen(true)}>
              + Nova mesa
            </button>
          </div>
        )}
      </main>

      {gitOpen && active && (
        <GitPanel deskId={active.id} deskName={active.name} onClose={() => setGitOpen(false)} />
      )}

      {usageOpen && <UsageMonitor billed={!!active?.billed} onClose={() => setUsageOpen(false)} />}

      {dialogOpen && (
        <NewDeskDialog
          defaultCwd={active?.cwd ?? "~"}
          onClose={() => setDialogOpen(false)}
          onCreate={async (body) => {
            setDialogOpen(false);
            const { desk } = await createDesk(body);
            await refreshDesks();
            setActiveId(desk.id);
          }}
        />
      )}
    </div>
  );
}
