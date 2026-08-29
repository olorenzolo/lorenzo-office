"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Small dependency-free markdown renderer. It only covers what the agents
 * actually emit — headings, lists, tables, code, emphasis, links — and it has
 * to stay readable while the text is still streaming in half-written.
 */
export default function Markdown({ text }: { text: string }) {
  return <div className="md">{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = /^\s*(`{3,})(.*)$/.exec(line);
    if (fence) {
      const ticks = fence[1];
      const lang = fence[2].trim();
      const body: string[] = [];
      i++;
      // Only a fence at least as long as the opener closes it, so a ```` block
      // may contain ``` blocks of its own.
      const closing = new RegExp(`^\\s*\`{${ticks.length},}\\s*$`);
      while (i < lines.length && !closing.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (may be missing while still streaming)
      if (body.length || lang) {
        out.push(
          <pre className="md-pre" key={key++}>
            {lang && <span className="md-lang">{lang}</span>}
            <code>{body.join("\n")}</code>
          </pre>,
        );
      }
      continue;
    }

    if (line.includes("|") && isDivider(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      out.push(
        <div className="md-table-wrap" key={key++}>
          <table className="md-table">
            <thead>
              <tr>
                {header.map((h, n) => (
                  <th key={n}>{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n}>
                  {r.map((c, m) => (
                    <td key={m}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = (["h3", "h4", "h5", "h5"] as const)[heading[1].length - 1];
      out.push(
        <Tag className="md-h" key={key++}>
          {inline(heading[2])}
        </Tag>,
      );
      i++;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[-*_\s]*$/.test(line)) {
      out.push(<hr className="md-hr" key={key++} />);
      i++;
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List className="md-list" key={key++}>
          {items.map((it, n) => (
            <li key={n}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(
        <blockquote className="md-quote" key={key++}>
          {inline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++]);
    out.push(
      <p className="md-p" key={key++}>
        {inline(para.join("\n"))}
      </p>,
    );
  }

  return out;
}

function isBlockStart(line: string) {
  return (
    /^\s*`{3,}/.test(line) ||
    /^(#{1,4})\s+/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
    /^\s*>\s?/.test(line)
  );
}

function isDivider(line: string | undefined) {
  return !!line && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
}

function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Inline emphasis, code and links. */
function inline(text: string): ReactNode {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    const token = match[0];
    if (token.startsWith("`")) {
      out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)!;
      out.push(
        <a key={key++} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>,
      );
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}
