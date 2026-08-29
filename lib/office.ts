import { query, type Options, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathHint } from "./media";
import type {
  Attachment,
  DeskInit,
  DeskStatus,
  DeskSummary,
  EventInput,
  OfficeEvent,
  PermissionMode,
} from "./types";

const STORE = path.join(os.homedir(), ".lorenzo-office");
const DESKS_FILE = path.join(STORE, "desks.json");
const LOG_DIR = path.join(STORE, "logs");
export const UPLOAD_DIR = path.join(STORE, "uploads");

function ensureStore() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** Unbounded async queue that feeds the SDK's streaming-input generator. */
class InputQueue {
  private items: SDKUserMessage[] = [];
  private waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = [];
  private closed = false;

  push(msg: SDKUserMessage) {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: msg, done: false });
    else this.items.push(msg);
  }

  close() {
    this.closed = true;
    while (this.waiters.length) this.waiters.shift()!({ value: undefined as never, done: true });
  }

  async *stream(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (this.items.length) {
        yield this.items.shift()!;
        continue;
      }
      if (this.closed) return;
      const res = await new Promise<IteratorResult<SDKUserMessage>>((r) => this.waiters.push(r));
      if (res.done) return;
      yield res.value;
    }
  }
}

interface PendingPermission {
  tool: string;
  input: Record<string, unknown>;
  resolve: (value: { allow: boolean; always: boolean }) => void;
}

export interface DeskOptions {
  name: string;
  cwd: string;
  model: string;
  role: string;
  permissionMode: PermissionMode;
  resumeSessionId?: string | null;
}

export class Desk {
  readonly id: string;
  name: string;
  cwd: string;
  model: string;
  /** Full model id the CLI resolved the alias to, for display only. */
  resolvedModel: string | null = null;
  role: string;
  permissionMode: PermissionMode;
  status: DeskStatus = "idle";
  sessionId: string | null = null;
  init: DeskInit | null = null;
  createdAt = Date.now();
  lastActivity = Date.now();
  totalCostUsd = 0;
  unread = 0;

  private events: OfficeEvent[] = [];
  private seq = 0;
  private subscribers = new Set<(e: OfficeEvent) => void>();
  private queue: InputQueue | null = null;
  private sdk: ReturnType<typeof query> | null = null;
  private pending = new Map<string, PendingPermission>();
  /** Tools (or Bash command prefixes) the user chose to always allow here. */
  private alwaysAllow = new Set<string>();
  private logStream: fs.WriteStream | null = null;
  private running = false;

  constructor(id: string, opts: DeskOptions) {
    this.id = id;
    this.name = opts.name;
    this.cwd = opts.cwd;
    this.model = opts.model;
    this.role = opts.role;
    this.permissionMode = opts.permissionMode;
    this.sessionId = opts.resumeSessionId ?? null;
  }

  // ---------------------------------------------------------------- events

  private emit(e: EventInput) {
    const event = { ...e, seq: ++this.seq, ts: Date.now() } as OfficeEvent;
    this.events.push(event);
    if (this.events.length > 8000) this.events.splice(0, 2000);
    this.lastActivity = event.ts;
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {
        /* a dead subscriber must not break the desk */
      }
    }
    this.appendLog(event);
  }

  private appendLog(event: OfficeEvent) {
    if (event.type === "text_delta" || event.type === "thinking_delta") return;
    if (!this.logStream) {
      ensureStore();
      this.logStream = fs.createWriteStream(path.join(LOG_DIR, `${this.id}.jsonl`), { flags: "a" });
    }
    this.logStream.write(JSON.stringify(event) + "\n");
  }

  history(): OfficeEvent[] {
    return this.events;
  }

  /**
   * Replays this desk's persisted log into memory. Without it, a desk restored
   * after a restart shows only what happened since — the earlier conversation
   * stays in the log file but never reaches the screen.
   */
  hydrate() {
    if (this.events.length) return;
    const stored = loadHistoryFromDisk(this.id);
    if (!stored.length) return;
    this.events = stored;
    this.seq = stored[stored.length - 1].seq;
  }

  subscribe(fn: (e: OfficeEvent) => void) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private setStatus(status: DeskStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit({ type: "status", status });
  }

  summary(): DeskSummary {
    return {
      id: this.id,
      name: this.name,
      cwd: this.cwd,
      model: this.model,
      resolvedModel: this.resolvedModel,
      role: this.role,
      permissionMode: this.permissionMode,
      status: this.status,
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      unread: this.unread,
      pendingPermissions: this.pending.size,
      totalCostUsd: this.totalCostUsd,
      // On a claude.ai subscription there is no API key and nothing is billed
      // per turn, so showing a dollar figure would misrepresent the plan.
      billed: !!this.init && this.init.apiKeySource !== "none",
    };
  }

  // ------------------------------------------------------------ permissions

  private permissionKey(tool: string, input: Record<string, unknown>): string {
    if (tool === "Bash" && typeof input.command === "string") {
      return `Bash:${input.command.trim().split(/\s+/).slice(0, 2).join(" ")}`;
    }
    return tool;
  }

  private canUseTool = async (
    tool: string,
    input: Record<string, unknown>,
  ): Promise<
    { behavior: "allow"; updatedInput: Record<string, unknown> } | { behavior: "deny"; message: string }
  > => {
    if (this.permissionMode === "bypassPermissions") return { behavior: "allow", updatedInput: input };
    if (this.alwaysAllow.has(this.permissionKey(tool, input)) || this.alwaysAllow.has(tool)) {
      return { behavior: "allow", updatedInput: input };
    }

    const id = randomUUID();
    const previousStatus = this.status;
    this.setStatus("waiting_permission");
    this.emit({ type: "permission_request", id, tool, input });

    const decision = await new Promise<{ allow: boolean; always: boolean }>((resolve) => {
      this.pending.set(id, { tool, input, resolve });
    });

    this.pending.delete(id);
    this.emit({
      type: "permission_resolved",
      id,
      decision: decision.allow ? (decision.always ? "always" : "allow") : "deny",
    });
    if (this.pending.size === 0) this.setStatus(previousStatus === "idle" ? "thinking" : previousStatus);

    if (decision.always) this.alwaysAllow.add(this.permissionKey(tool, input));
    return decision.allow
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "Lorenzo negou o uso desta ferramenta." };
  };

  resolvePermission(id: string, allow: boolean, always: boolean): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    pending.resolve({ allow, always });
    return true;
  }

  pendingList() {
    return [...this.pending.entries()].map(([id, p]) => ({ id, tool: p.tool, input: p.input }));
  }

  // ---------------------------------------------------------------- driving

  send(text: string, attachments: Attachment[] = []) {
    this.emit({ type: "user", text, ...(attachments.length ? { attachments } : {}) });
    if (!this.running) this.start();
    this.setStatus("thinking");
    this.queue!.push({
      type: "user",
      message: { role: "user", content: buildContent(text, attachments) },
      parent_tool_use_id: null,
      session_id: this.sessionId ?? "",
    } as SDKUserMessage);
  }

  private start() {
    this.running = true;
    this.queue = new InputQueue();

    const options: Options = {
      cwd: this.cwd,
      model: this.model,
      permissionMode: this.permissionMode,
      // Load the user's real Claude Code configuration: CLAUDE.md, skills,
      // subagents, plugins, MCP servers and permission rules.
      settingSources: ["user", "project", "local"],
      systemPrompt: this.role.trim()
        ? { type: "preset", preset: "claude_code", append: this.role.trim() }
        : { type: "preset", preset: "claude_code" },
      includePartialMessages: true,
      canUseTool: this.canUseTool,
      ...(this.sessionId ? { resume: this.sessionId } : {}),
    };

    const stream = query({ prompt: this.queue.stream(), options });
    this.sdk = stream;

    void (async () => {
      try {
        for await (const message of stream) this.handle(message);
      } catch (err) {
        this.emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
        this.setStatus("error");
      } finally {
        this.running = false;
        this.sdk = null;
      }
    })();
  }

  /** Message ids whose text already arrived as deltas, so we don't print it twice. */
  private streamedMessages = new Set<string>();
  /** Newest streaming message id per thread (main or subagent), for block keys. */
  private currentMessage = new Map<string, string>();

  private handle(message: SDKMessage) {
    switch (message.type) {
      case "system": {
        if (message.subtype === "init") {
          this.sessionId = message.session_id;
          this.init = {
            apiKeySource: message.apiKeySource ?? "none",
            tools: message.tools ?? [],
            slashCommands: message.slash_commands ?? [],
            agents: message.agents ?? [],
            skills: message.skills ?? [],
            plugins: (message.plugins ?? []).map((p) => p.name),
            mcpServers: (message.mcp_servers ?? []) as { name: string; status: string }[],
            model: message.model,
            cwd: message.cwd,
          };
          this.resolvedModel = message.model;
          this.emit({ type: "init", init: this.init });
          saveDesks();
        } else if (message.subtype === "compact_boundary") {
          this.emit({
            type: "compact",
            trigger:
              (message as { compact_metadata?: { trigger?: string } }).compact_metadata?.trigger ?? "auto",
          });
        }
        break;
      }

      case "stream_event": {
        const ev = message.event as {
          type: string;
          message?: { id?: string };
          index?: number;
          delta?: { type?: string; text?: string; thinking?: string };
        };
        const agent = message.parent_tool_use_id ?? null;
        const thread = message.parent_tool_use_id ?? "main";
        if (ev.type === "message_start" && ev.message?.id) {
          this.streamedMessages.add(ev.message.id);
          this.currentMessage.set(thread, ev.message.id);
        } else if (ev.type === "content_block_delta" && ev.delta) {
          const blockId = `${this.currentMessage.get(thread) ?? message.session_id}:${thread}:${ev.index}`;
          if (ev.delta.type === "text_delta" && ev.delta.text) {
            this.emit({ type: "text_delta", id: blockId, text: ev.delta.text, agent });
          } else if (ev.delta.type === "thinking_delta" && ev.delta.thinking) {
            this.emit({ type: "thinking_delta", id: blockId, text: ev.delta.thinking, agent });
          }
        } else if (ev.type === "content_block_stop") {
          const blockId = `${this.currentMessage.get(thread) ?? message.session_id}:${thread}:${ev.index}`;
          this.emit({ type: "block_end", id: blockId });
        }
        break;
      }

      case "assistant": {
        const agent = message.parent_tool_use_id ?? null;
        const streamed = this.streamedMessages.has(message.message.id);
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            this.emit({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: (block.input ?? {}) as Record<string, unknown>,
              agent,
            });
          } else if (block.type === "text" && !streamed && block.text.trim()) {
            this.emit({ type: "text", id: `${message.message.id}:full`, text: block.text, agent });
          }
        }
        break;
      }

      case "user": {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_result") {
              this.emit({
                type: "tool_result",
                toolUseId: block.tool_use_id,
                content: stringifyResult(block.content),
                isError: block.is_error === true,
              });
            }
          }
        }
        break;
      }

      case "result": {
        this.totalCostUsd += message.total_cost_usd ?? 0;
        this.emit({
          type: "result",
          durationMs: message.duration_ms,
          costUsd: message.total_cost_usd ?? 0,
          turns: message.num_turns,
          isError: message.is_error,
          subtype: message.subtype,
        });
        this.unread += 1;
        this.setStatus(message.is_error ? "error" : "idle");
        saveDesks();
        break;
      }
    }
  }

  async interrupt() {
    for (const [id] of this.pending) this.resolvePermission(id, false, false);
    try {
      await this.sdk?.interrupt();
    } catch {
      /* nothing running */
    }
    this.setStatus("idle");
  }

  async setModel(model: string) {
    this.model = model;
    try {
      await this.sdk?.setModel(model);
    } catch {
      /* applied on next start */
    }
    saveDesks();
  }

  async setPermissionMode(mode: PermissionMode) {
    this.permissionMode = mode;
    try {
      await this.sdk?.setPermissionMode(mode);
    } catch {
      /* applied on next start */
    }
    saveDesks();
  }

  markRead() {
    this.unread = 0;
  }

  async close() {
    for (const [id] of this.pending) this.resolvePermission(id, false, false);
    this.queue?.close();
    try {
      await this.sdk?.interrupt();
    } catch {
      /* already stopped */
    }
    this.logStream?.end();
    this.setStatus("closed");
  }
}

/**
 * Turns the composer's attachments into Messages API content blocks. Images and
 * PDFs small enough to inline go as real blocks so the model sees them; every
 * other file is handed over as a path, which is what the terminal does with a
 * dragged-in file and lets the agent reach for Read, ffmpeg or ffprobe.
 */
function buildContent(text: string, attachments: Attachment[]) {
  if (!attachments.length) return text;

  const blocks: Record<string, unknown>[] = [];
  const handed: Attachment[] = [];

  for (const file of attachments) {
    try {
      if (file.delivery === "inline_image") {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.mediaType,
            data: fs.readFileSync(file.path).toString("base64"),
          },
        });
        continue;
      }
      if (file.delivery === "inline_document") {
        blocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fs.readFileSync(file.path).toString("base64"),
          },
        });
        continue;
      }
    } catch {
      /* unreadable upload: fall through to the path form */
    }
    handed.push(file);
  }

  const parts = [text];
  if (handed.length) {
    const lines = handed.map((f) => `- ${f.name} (${pathHint(f.kind)}): ${f.path}`);
    parts.push(`\n\nArquivos anexados nesta mensagem:\n${lines.join("\n")}`);
  }
  blocks.push({ type: "text", text: parts.join("") });
  return blocks;
}

function stringifyResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as { type?: string; text?: string };
        if (block.type === "text") return block.text ?? "";
        return `[${block.type ?? "block"}]`;
      })
      .join("\n");
  }
  return JSON.stringify(content ?? "");
}

// ------------------------------------------------------------------- office

class Office {
  desks = new Map<string, Desk>();

  create(opts: DeskOptions & { id?: string }): Desk {
    const id = opts.id ?? randomUUID().slice(0, 8);
    const desk = new Desk(id, opts);
    this.desks.set(id, desk);
    saveDesks();
    return desk;
  }

  get(id: string): Desk | undefined {
    return this.desks.get(id);
  }

  list(): DeskSummary[] {
    return [...this.desks.values()]
      .filter((d) => d.status !== "closed")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((d) => d.summary());
  }

  async remove(id: string) {
    const desk = this.desks.get(id);
    if (!desk) return;
    await desk.close();
    this.desks.delete(id);
    saveDesks();
  }
}

// A module singleton would be recreated on every hot reload in dev, orphaning
// live agent subprocesses — so it is pinned to globalThis.
const globalRef = globalThis as unknown as { __lorenzoOffice?: Office };
export const office: Office = globalRef.__lorenzoOffice ?? (globalRef.__lorenzoOffice = restore());

function saveDesks() {
  try {
    ensureStore();
    const data = [...office.desks.values()]
      .filter((d) => d.status !== "closed")
      .map((d) => ({
        id: d.id,
        name: d.name,
        cwd: d.cwd,
        model: d.model,
        role: d.role,
        permissionMode: d.permissionMode,
        sessionId: d.sessionId,
        createdAt: d.createdAt,
        totalCostUsd: d.totalCostUsd,
      }));
    fs.writeFileSync(DESKS_FILE, JSON.stringify(data, null, 2));
  } catch {
    /* persistence is best-effort */
  }
}

function restore(): Office {
  const office = new Office();
  try {
    if (!fs.existsSync(DESKS_FILE)) return office;
    const data = JSON.parse(fs.readFileSync(DESKS_FILE, "utf8")) as Array<
      DeskOptions & { id: string; sessionId: string | null; createdAt: number; totalCostUsd: number }
    >;
    for (const item of data) {
      const desk = new Desk(item.id, { ...item, resumeSessionId: item.sessionId });
      desk.createdAt = item.createdAt ?? Date.now();
      desk.totalCostUsd = item.totalCostUsd ?? 0;
      desk.hydrate();
      office.desks.set(item.id, desk);
    }
  } catch {
    /* start clean if the store is unreadable */
  }
  return office;
}

export function loadHistoryFromDisk(id: string): OfficeEvent[] {
  try {
    const file = path.join(LOG_DIR, `${id}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .slice(-1200)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as OfficeEvent];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
