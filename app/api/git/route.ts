import { NextResponse } from "next/server";
import { office } from "@/lib/office";
import * as git from "@/lib/git";

export const dynamic = "force-dynamic";

/** Status of the repository the given desk is working in. */
export async function GET(req: Request) {
  const deskId = new URL(req.url).searchParams.get("desk");
  const desk = deskId ? office.get(deskId) : undefined;
  if (!desk) return NextResponse.json({ error: "desk not found" }, { status: 404 });

  return NextResponse.json(await git.status(desk.cwd));
}

type Action =
  | { action: "stage" | "unstage" | "discard"; paths: string[] }
  | { action: "commit"; message: string; stageAll?: boolean }
  | { action: "pull" | "push" | "sync" }
  | { action: "log"; limit?: number }
  | { action: "diff"; path: string; staged?: boolean };

export async function POST(req: Request) {
  const deskId = new URL(req.url).searchParams.get("desk");
  const desk = deskId ? office.get(deskId) : undefined;
  if (!desk) return NextResponse.json({ error: "desk not found" }, { status: 404 });

  const body = (await req.json()) as Action;
  const cwd = desk.cwd;

  try {
    switch (body.action) {
      case "stage":
        await git.stage(cwd, body.paths);
        break;
      case "unstage":
        await git.unstage(cwd, body.paths);
        break;
      case "discard":
        await git.discard(cwd, body.paths);
        break;
      case "commit":
        if (!body.message.trim()) {
          return NextResponse.json({ error: "mensagem vazia" }, { status: 400 });
        }
        await git.commit(cwd, body.message, body.stageAll !== false);
        break;
      case "pull":
        await git.pull(cwd);
        break;
      case "push":
        await git.push(cwd);
        break;
      case "sync": {
        // obsidian-git's "commit-and-sync": land local work, then reconcile.
        await git.pull(cwd);
        await git.push(cwd);
        break;
      }
      case "log":
        return NextResponse.json({ commits: await git.log(cwd, body.limit ?? 30) });
      case "diff":
        return NextResponse.json({ diff: await git.diff(cwd, body.path, body.staged === true) });
    }
  } catch (err) {
    return NextResponse.json({ error: git.message(err) }, { status: 400 });
  }

  return NextResponse.json({ status: await git.status(cwd) });
}
