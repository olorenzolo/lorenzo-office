export type DeskStatus = "idle" | "thinking" | "waiting_permission" | "error" | "closed";

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

/**
 * How an attachment reaches the agent.
 * - `inline_image` / `inline_document`: the model sees the bytes directly.
 * - `path`: the file is handed over as a path, exactly like dragging a file
 *   into the terminal — the agent opens it with Read, ffmpeg, or whatever fits.
 */
export type Delivery = "inline_image" | "inline_document" | "path";

export type MediaKind = "image" | "video" | "audio" | "document" | "text" | "file";

export interface Attachment {
  id: string;
  name: string;
  path: string;
  mediaType: string;
  size: number;
  kind: MediaKind;
  delivery: Delivery;
}

export interface DeskInit {
  apiKeySource: string;
  tools: string[];
  slashCommands: string[];
  agents: string[];
  skills: string[];
  plugins: string[];
  mcpServers: { name: string; status: string }[];
  model: string;
  cwd: string;
}

export interface DeskSummary {
  id: string;
  name: string;
  cwd: string;
  model: string;
  resolvedModel: string | null;
  role: string;
  permissionMode: PermissionMode;
  status: DeskStatus;
  sessionId: string | null;
  createdAt: number;
  lastActivity: number;
  unread: number;
  pendingPermissions: number;
  totalCostUsd: number;
  billed: boolean;
}

export type OfficeEvent =
  | { seq: number; ts: number; type: "user"; text: string; attachments?: Attachment[] }
  | { seq: number; ts: number; type: "text"; id: string; text: string; agent: string | null }
  | { seq: number; ts: number; type: "text_delta"; id: string; text: string; agent: string | null }
  | { seq: number; ts: number; type: "thinking_delta"; id: string; text: string; agent: string | null }
  | { seq: number; ts: number; type: "block_end"; id: string }
  | {
      seq: number;
      ts: number;
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      agent: string | null;
    }
  | { seq: number; ts: number; type: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { seq: number; ts: number; type: "permission_request"; id: string; tool: string; input: Record<string, unknown> }
  | { seq: number; ts: number; type: "permission_resolved"; id: string; decision: "allow" | "always" | "deny" }
  | {
      seq: number;
      ts: number;
      type: "result";
      durationMs: number;
      costUsd: number;
      turns: number;
      isError: boolean;
      subtype: string;
    }
  | { seq: number; ts: number; type: "status"; status: DeskStatus }
  | { seq: number; ts: number; type: "init"; init: DeskInit }
  | { seq: number; ts: number; type: "error"; message: string }
  | { seq: number; ts: number; type: "compact"; trigger: string };

/** Omit that distributes over the event union instead of collapsing it. */
export type EventInput = OfficeEvent extends infer T
  ? T extends OfficeEvent
    ? Omit<T, "seq" | "ts">
    : never
  : never;
