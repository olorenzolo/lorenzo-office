import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Nothing here is shell-interpolated: args go as an array, never a string. */
async function git(cwd: string, args: string[], timeout = 20000) {
  const { stdout } = await run("git", args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

export interface GitFile {
  path: string;
  /** Two-letter porcelain code, e.g. "M." staged-modified, ".M" worktree-modified. */
  code: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  label: string;
}

export interface GitStatus {
  repo: boolean;
  root: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
  remoteUrl: string | null;
  githubUrl: string | null;
  clean: boolean;
  error?: string;
}

const LABEL: Record<string, string> = {
  M: "modificado",
  A: "adicionado",
  D: "removido",
  R: "renomeado",
  C: "copiado",
  U: "conflito",
  "?": "novo",
};

/** Turns a git remote (ssh or https) into a browsable GitHub URL. */
function toGithubUrl(remote: string): string | null {
  const ssh = /^git@github\.com:(.+?)(?:\.git)?$/.exec(remote.trim());
  if (ssh) return `https://github.com/${ssh[1]}`;
  const https = /^https:\/\/github\.com\/(.+?)(?:\.git)?$/.exec(remote.trim());
  if (https) return `https://github.com/${https[1]}`;
  return null;
}

export async function status(cwd: string): Promise<GitStatus> {
  const empty: GitStatus = {
    repo: false,
    root: null,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
    remoteUrl: null,
    githubUrl: null,
    clean: true,
  };

  let root: string;
  try {
    root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return empty;
  }

  try {
    const out = await git(cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=all"]);
    const files: GitFile[] = [];
    let branch: string | null = null;
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;

    for (const line of out.split("\n")) {
      if (!line) continue;

      if (line.startsWith("# branch.head ")) {
        branch = line.slice("# branch.head ".length).trim();
        continue;
      }
      if (line.startsWith("# branch.upstream ")) {
        upstream = line.slice("# branch.upstream ".length).trim();
        continue;
      }
      if (line.startsWith("# branch.ab ")) {
        const m = /\+(\d+) -(\d+)/.exec(line);
        if (m) {
          ahead = Number(m[1]);
          behind = Number(m[2]);
        }
        continue;
      }
      if (line.startsWith("#")) continue;

      if (line.startsWith("? ")) {
        const p = line.slice(2);
        files.push({
          path: p,
          code: "??",
          staged: false,
          unstaged: true,
          untracked: true,
          label: LABEL["?"],
        });
        continue;
      }

      // "1 XY ... <path>" for ordinary changes, "2 XY ... <path>\t<orig>" for renames.
      if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const parts = line.split(" ");
        const code = parts[1];
        const p = line.startsWith("2 ")
          ? parts.slice(9).join(" ").split("\t")[0]
          : parts.slice(8).join(" ");
        const stagedCode = code[0];
        const worktreeCode = code[1];
        files.push({
          path: p,
          code,
          staged: stagedCode !== ".",
          unstaged: worktreeCode !== ".",
          untracked: false,
          label: LABEL[stagedCode !== "." ? stagedCode : worktreeCode] ?? "alterado",
        });
        continue;
      }

      if (line.startsWith("u ")) {
        const p = line.split(" ").slice(10).join(" ");
        files.push({ path: p, code: "UU", staged: false, unstaged: true, untracked: false, label: LABEL.U });
      }
    }

    let remoteUrl: string | null = null;
    try {
      remoteUrl = (await git(cwd, ["remote", "get-url", "origin"])).trim() || null;
    } catch {
      /* no remote configured */
    }

    return {
      repo: true,
      root,
      branch,
      upstream,
      ahead,
      behind,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      remoteUrl,
      githubUrl: remoteUrl ? toGithubUrl(remoteUrl) : null,
      clean: files.length === 0,
    };
  } catch (err) {
    return { ...empty, repo: true, root, error: message(err) };
  }
}

export async function stage(cwd: string, paths: string[]) {
  await git(cwd, ["add", "--", ...paths]);
}

export async function unstage(cwd: string, paths: string[]) {
  await git(cwd, ["restore", "--staged", "--", ...paths]);
}

export async function discard(cwd: string, paths: string[]) {
  // Untracked files have nothing to restore from, so they are removed instead.
  const st = await status(cwd);
  const untracked = new Set(st.files.filter((f) => f.untracked).map((f) => f.path));
  const tracked = paths.filter((p) => !untracked.has(p));
  const fresh = paths.filter((p) => untracked.has(p));
  if (tracked.length) await git(cwd, ["restore", "--staged", "--worktree", "--", ...tracked]);
  if (fresh.length) await git(cwd, ["clean", "-fd", "--", ...fresh]);
}

export async function commit(cwd: string, messageText: string, stageAll: boolean) {
  if (stageAll) await git(cwd, ["add", "-A"]);
  await git(cwd, ["commit", "-m", messageText]);
}

export async function pull(cwd: string) {
  return git(cwd, ["pull", "--rebase", "--autostash"], 90000);
}

export async function push(cwd: string) {
  const st = await status(cwd);
  // A branch with no upstream needs one before push will work.
  const args = st.upstream ? ["push"] : ["push", "--set-upstream", "origin", st.branch ?? "HEAD"];
  return git(cwd, args, 90000);
}

export interface Commit {
  hash: string;
  short: string;
  author: string;
  date: string;
  subject: string;
}

/** ASCII unit separator: it cannot appear in a commit subject. */
const SEP = "\u001f";

export async function log(cwd: string, limit = 30): Promise<Commit[]> {
  const out = await git(cwd, [
    "log",
    `-${limit}`,
    `--pretty=format:%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%s`,
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, date, subject] = line.split(SEP);
      return { hash, short, author, date, subject };
    });
}

export async function diff(cwd: string, filePath: string, staged: boolean): Promise<string> {
  const args = ["diff", "--no-color"];
  if (staged) args.push("--staged");
  args.push("--", filePath);

  try {
    const out = await git(cwd, args);
    if (out.trim()) return out;
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return stdout;
  }

  // An untracked file has no diff against the index; show it as a pure addition.
  try {
    return await git(cwd, ["diff", "--no-color", "--no-index", "/dev/null", filePath]);
  } catch (err) {
    // --no-index exits non-zero when the files differ, with the diff on stdout.
    return (err as { stdout?: string }).stdout ?? "";
  }
}

export function message(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  return (e.stderr || e.message || String(err)).trim();
}
