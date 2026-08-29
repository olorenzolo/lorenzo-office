import type { Attachment, OfficeEvent } from "@/lib/types";

export type Item =
  | { kind: "user"; key: string; text: string; attachments: Attachment[] }
  | { kind: "text"; key: string; text: string; agent: string | null }
  | { kind: "thinking"; key: string; text: string; agent: string | null }
  | {
      kind: "tool";
      key: string;
      id: string;
      name: string;
      input: Record<string, unknown>;
      agent: string | null;
      result?: { content: string; isError: boolean };
    }
  | {
      kind: "permission";
      key: string;
      id: string;
      tool: string;
      input: Record<string, unknown>;
      decision?: "allow" | "always" | "deny";
    }
  | {
      kind: "result";
      key: string;
      durationMs: number;
      costUsd: number;
      turns: number;
      isError: boolean;
      subtype: string;
    }
  | { kind: "error"; key: string; message: string }
  | { kind: "notice"; key: string; text: string };

/** Folds the raw desk event log into renderable items, merging streamed deltas. */
export function applyEvent(items: Item[], e: OfficeEvent): Item[] {
  switch (e.type) {
    case "user":
      return [...items, { kind: "user", key: `u${e.seq}`, text: e.text, attachments: e.attachments ?? [] }];

    case "text":
    case "text_delta":
    case "thinking_delta": {
      const kind = e.type === "thinking_delta" ? "thinking" : "text";
      const key = `${kind}:${e.id}`;
      const index = findLast(items, (i) => i.key === key);
      if (index >= 0) {
        const next = [...items];
        const prev = next[index] as Extract<Item, { kind: "text" | "thinking" }>;
        next[index] = { ...prev, text: prev.text + e.text };
        return next;
      }
      return [...items, { kind, key, text: e.text, agent: e.agent } as Item];
    }

    case "tool_use":
      return [
        ...items,
        { kind: "tool", key: `t:${e.id}`, id: e.id, name: e.name, input: e.input, agent: e.agent },
      ];

    case "tool_result": {
      const index = findLast(items, (i) => i.kind === "tool" && i.id === e.toolUseId);
      if (index < 0) return items;
      const next = [...items];
      const prev = next[index] as Extract<Item, { kind: "tool" }>;
      next[index] = { ...prev, result: { content: e.content, isError: e.isError } };
      return next;
    }

    case "permission_request":
      return [...items, { kind: "permission", key: `p:${e.id}`, id: e.id, tool: e.tool, input: e.input }];

    case "permission_resolved": {
      const index = findLast(items, (i) => i.kind === "permission" && i.id === e.id);
      if (index < 0) return items;
      const next = [...items];
      next[index] = { ...(next[index] as Extract<Item, { kind: "permission" }>), decision: e.decision };
      return next;
    }

    case "result":
      return [
        ...items,
        {
          kind: "result",
          key: `r${e.seq}`,
          durationMs: e.durationMs,
          costUsd: e.costUsd,
          turns: e.turns,
          isError: e.isError,
          subtype: e.subtype,
        },
      ];

    case "error":
      return [...items, { kind: "error", key: `e${e.seq}`, message: e.message }];

    case "compact":
      return [...items, { kind: "notice", key: `c${e.seq}`, text: "— contexto compactado —" }];

    default:
      return items;
  }
}

function findLast(items: Item[], pred: (i: Item) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (pred(items[i])) return i;
  return -1;
}
