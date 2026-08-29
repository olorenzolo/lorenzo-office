"use client";

import { useState } from "react";
import type { Item } from "@/lib/timeline";

type Tool = Extract<Item, { kind: "tool" }>;

/** One-line summary of what a tool call is doing, per tool. */
export function toolSummary(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  switch (name) {
    case "Bash":
      return s("command").replace(/\s+/g, " ").slice(0, 160);
    case "Read":
    case "Write":
    case "Edit":
      return short(s("file_path"));
    case "Glob":
      return s("pattern");
    case "Grep":
      return `${s("pattern")}${s("path") ? ` em ${short(s("path"))}` : ""}`;
    case "TodoWrite":
      return `${(input.todos as unknown[] | undefined)?.length ?? 0} tarefas`;
    case "Task":
    case "Agent":
      return `${s("subagent_type") || "agent"} · ${s("description")}`;
    case "Skill":
      return `/${s("skill")} ${s("args")}`.trim();
    case "WebFetch":
    case "WebSearch":
      return s("url") || s("query");
    default: {
      const first = Object.values(input).find((v) => typeof v === "string") as string | undefined;
      return first ? first.slice(0, 140) : "";
    }
  }
}

function short(p: string) {
  if (!p) return "";
  return p.startsWith("/Users/") ? "~/" + p.split("/").slice(3).join("/") : p;
}

export default function ToolCard({ tool }: { tool: Tool }) {
  const [open, setOpen] = useState(false);
  const running = !tool.result;
  const failed = tool.result?.isError === true;

  return (
    <div className="tool">
      <button className="tool-head" onClick={() => setOpen((v) => !v)}>
        <span className="tool-name">{tool.name}</span>
        <span className="tool-arg">{toolSummary(tool.name, tool.input)}</span>
        <span className={`tool-status${failed ? " err" : ""}`}>
          {running ? "···" : failed ? "erro" : open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="tool-body">
          <ToolDetail tool={tool} />
        </div>
      )}
      {!open && failed && (
        <div className="tool-body" style={{ maxHeight: 140 }}>
          {tool.result!.content.slice(0, 800)}
        </div>
      )}
    </div>
  );
}

function ToolDetail({ tool }: { tool: Tool }) {
  const { name, input, result } = tool;

  if (name === "TodoWrite") {
    const todos = (input.todos ?? []) as { content: string; status: string; activeForm?: string }[];
    return (
      <ul className="todo">
        {todos.map((t, i) => (
          <li key={i} className={t.status}>
            <span className="mark">
              {t.status === "completed" ? "✓" : t.status === "in_progress" ? "▸" : "○"}
            </span>
            <span>{t.status === "in_progress" ? (t.activeForm ?? t.content) : t.content}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {name === "Bash" && typeof input.command === "string" && (
        <>
          <span className="label">comando</span>
          <div className="cmd">$ {input.command}</div>
        </>
      )}

      {name === "Edit" && typeof input.old_string === "string" && (
        <>
          <span className="label">{short(String(input.file_path ?? ""))}</span>
          <div className="diff-del">{prefix(String(input.old_string), "- ")}</div>
          <div className="diff-add">{prefix(String(input.new_string ?? ""), "+ ")}</div>
        </>
      )}

      {name === "Write" && typeof input.content === "string" && (
        <>
          <span className="label">{short(String(input.file_path ?? ""))}</span>
          <div>{String(input.content).slice(0, 4000)}</div>
        </>
      )}

      {!["Bash", "Edit", "Write", "TodoWrite"].includes(name) && (
        <>
          <span className="label">entrada</span>
          <div>{JSON.stringify(input, null, 2).slice(0, 3000)}</div>
        </>
      )}

      {result && (
        <>
          <span className="label">{result.isError ? "erro" : "resultado"}</span>
          <div style={{ color: result.isError ? "var(--red)" : undefined }}>
            {result.content.slice(0, 12000) || "(vazio)"}
          </div>
        </>
      )}
    </>
  );
}

function prefix(text: string, mark: string) {
  return text
    .split("\n")
    .map((l) => mark + l)
    .join("\n");
}
