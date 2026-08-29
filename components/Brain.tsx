"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Item } from "@/lib/timeline";
import type { DeskStatus, DeskSummary } from "@/lib/types";

type NodeKind = "core" | "agent" | "tool" | "file";

interface Node {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** When this node last did something, for the glow decay. */
  hot: number;
}

interface Link {
  a: string;
  b: string;
}

const COLOR: Record<NodeKind, string> = {
  core: "#e8935c",
  agent: "#a78bda",
  tool: "#6ba8e5",
  file: "#6bbf7b",
};

const STATE_LABEL: Record<DeskStatus, string> = {
  idle: "em repouso",
  thinking: "pensando",
  waiting_permission: "aguardando você",
  error: "erro",
  closed: "encerrada",
};

/** Last path segment, so a node reads as "office.ts" and not the whole path. */
function baseName(p: string) {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

interface Graph {
  nodes: { id: string; label: string; kind: NodeKind; weight: number }[];
  links: Link[];
}

/** Turns the recent conversation into the graph: what ran, and what it touched. */
function buildGraph(active: DeskSummary | null, items: Item[]): Graph {
  const coreId = "core";
  const nodes = new Map<string, { id: string; label: string; kind: NodeKind; weight: number }>();
  const links: Link[] = [];
  const seen = new Set<string>();

  nodes.set(coreId, { id: coreId, label: active?.name ?? "office", kind: "core", weight: 6 });

  const link = (a: string, b: string) => {
    const key = `${a}|${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ a, b });
  };

  const bump = (id: string, label: string, kind: NodeKind) => {
    const existing = nodes.get(id);
    if (existing) existing.weight += 1;
    else nodes.set(id, { id, label, kind, weight: 1 });
  };

  // Only the tail matters: an old graph is noise, not history.
  const recent = items.filter((i) => i.kind === "tool").slice(-42) as Extract<Item, { kind: "tool" }>[];

  for (const tool of recent) {
    const isAgent = tool.name === "Task" || tool.name === "Agent";
    if (isAgent) {
      const input = tool.input as { subagent_type?: string; description?: string };
      const id = `agent:${tool.id}`;
      bump(id, input.subagent_type || input.description || "agent", "agent");
      link(coreId, id);
      continue;
    }

    const toolId = `tool:${tool.name}`;
    bump(toolId, tool.name, "tool");
    // A subagent's tool call hangs off that agent, not off the core.
    const parent = tool.agent ? `agent:${tool.agent}` : coreId;
    link(nodes.has(parent) ? parent : coreId, toolId);

    const input = tool.input as { file_path?: string; path?: string; pattern?: string };
    const target = input.file_path ?? input.path;
    if (target) {
      const fileId = `file:${target}`;
      bump(fileId, baseName(target), "file");
      link(toolId, fileId);
    }
  }

  return { nodes: [...nodes.values()], links };
}

interface Props {
  desks: DeskSummary[];
  active: DeskSummary | null;
  items: Item[];
}

export default function Brain({ desks, active, items }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const linksRef = useRef<Link[]>([]);
  const graph = useMemo(() => buildGraph(active, items), [active, items]);

  const status: DeskStatus = active?.status ?? "idle";
  const busy = status === "thinking";

  // Reconcile the simulation with the latest graph, keeping positions of nodes
  // that survived so the layout does not jump on every new tool call.
  useEffect(() => {
    const nodes = nodesRef.current;
    const now = Date.now();
    const wanted = new Set(graph.nodes.map((n) => n.id));

    for (const id of [...nodes.keys()]) if (!wanted.has(id)) nodes.delete(id);

    for (const g of graph.nodes) {
      const existing = nodes.get(g.id);
      const r = g.kind === "core" ? 13 : 4 + Math.min(6, g.weight * 1.4);
      if (existing) {
        existing.r = r;
        existing.label = g.label;
        continue;
      }
      // New nodes enter near the core, then get pushed out by repulsion.
      const angle = Math.random() * Math.PI * 2;
      nodes.set(g.id, {
        id: g.id,
        label: g.label,
        kind: g.kind,
        x: Math.cos(angle) * 40,
        y: Math.sin(angle) * 40,
        vx: 0,
        vy: 0,
        r,
        hot: now,
      });
    }
    linksRef.current = graph.links;
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    const step = () => {
      const nodes = [...nodesRef.current.values()];
      const links = linksRef.current;
      const cx = width / 2;
      const cy = height / 2;

      // --- forces -------------------------------------------------------
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          if (dist > 260) continue;
          const push = 900 / (dist * dist);
          dx /= dist;
          dy /= dist;
          a.vx -= dx * push;
          a.vy -= dy * push;
          b.vx += dx * push;
          b.vy += dy * push;
        }
      }

      for (const l of links) {
        const a = nodesRef.current.get(l.a);
        const b = nodesRef.current.get(l.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const rest = 78;
        const pull = (dist - rest) * 0.006;
        const ux = dx / dist;
        const uy = dy / dist;
        a.vx += ux * pull;
        a.vy += uy * pull;
        b.vx -= ux * pull;
        b.vy -= uy * pull;
      }

      for (const n of nodes) {
        if (n.kind === "core") {
          // The core is the anchor; everything else arranges around it.
          n.x += (0 - n.x) * 0.08;
          n.y += (0 - n.y) * 0.08;
          n.vx *= 0.5;
          n.vy *= 0.5;
          continue;
        }
        n.vx += (0 - n.x) * 0.0009;
        n.vy += (0 - n.y) * 0.0009;
        n.vx *= 0.86;
        n.vy *= 0.86;
        n.x += n.vx;
        n.y += n.vy;
      }

      // --- paint --------------------------------------------------------
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(cx, cy);

      ctx.lineWidth = 1;
      for (const l of links) {
        const a = nodesRef.current.get(l.a);
        const b = nodesRef.current.get(l.b);
        if (!a || !b) continue;
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `${COLOR[a.kind]}55`);
        grad.addColorStop(1, `${COLOR[b.kind]}22`);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const now = Date.now();
      for (const n of nodes) {
        const age = now - n.hot;
        const heat = Math.max(0, 1 - age / 2600);
        const color = COLOR[n.kind];

        if (heat > 0 || n.kind === "core") {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 9 + heat * 7, 0, Math.PI * 2);
          ctx.fillStyle = `${color}${Math.round((0.1 + heat * 0.22) * 255)
            .toString(16)
            .padStart(2, "0")}`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.55 + heat * 0.45;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}dd`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (n.kind !== "file" || n.r > 6) {
          ctx.font = `${n.kind === "core" ? 11 : 9.5}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.textAlign = "center";
          ctx.fillStyle = n.kind === "core" ? "#dce3ea" : "#8b96a5";
          ctx.fillText(n.label.slice(0, 22), n.x, n.y + n.r + 12);
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  // Any new tool call reheats the graph so the freshest nodes glow.
  const toolCount = items.filter((i) => i.kind === "tool").length;
  useEffect(() => {
    const now = Date.now();
    const nodes = [...nodesRef.current.values()];
    for (const n of nodes.slice(-4)) n.hot = now;
  }, [toolCount]);

  const agents = graph.nodes.filter((n) => n.kind === "agent").length;
  const tools = graph.nodes.filter((n) => n.kind === "tool").length;
  const files = graph.nodes.filter((n) => n.kind === "file").length;

  return (
    <div className={`brain${busy ? " busy" : ""}`}>
      <canvas ref={canvasRef} className="brain-canvas" />

      <div className="brain-hud">
        <span className="hud-key">
          <i style={{ background: COLOR.core }} /> mesa
        </span>
        <span className="hud-key">
          <i style={{ background: COLOR.agent }} /> agent
        </span>
        <span className="hud-key">
          <i style={{ background: COLOR.tool }} /> tool
        </span>
        <span className="hud-key">
          <i style={{ background: COLOR.file }} /> arquivo
        </span>
      </div>

      <div className="brain-legend">
        <div className="brain-status">
          <span className={`dot ${status}`} />
          <span className="brain-desk">{active ? active.name : "nenhuma mesa"}</span>
          <span className="brain-state">{STATE_LABEL[status]}</span>
        </div>
        <div className="brain-counts">
          <span>
            <b>{agents}</b> agents
          </span>
          <span>
            <b>{tools}</b> tools
          </span>
          <span>
            <b>{files}</b> arquivos
          </span>
          <span>
            <b>{desks.filter((d) => d.status === "thinking").length}</b> mesas ativas
          </span>
        </div>
      </div>
    </div>
  );
}
