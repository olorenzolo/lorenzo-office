# Contratos de dados

O que existe para mostrar na tela. Extraído de `lib/`; a fonte é o código.


## Mesa e eventos — `lib/types.ts`

```ts
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
export interface Attachment {
  id: string;
  name: string;
  path: string;
  mediaType: string;
  size: number;
  kind: MediaKind;
  delivery: Delivery;
}
export type MediaKind = "image" | "video" | "audio" | "document" | "text" | "file";
/**
 * How an attachment reaches the agent.
 * - `inline_image` / `inline_document`: the model sees the bytes directly.
 * - `path`: the file is handed over as a path, exactly like dragging a file
 *   into the terminal — the agent opens it with Read, ffmpeg, or whatever fits.
 */
export type Delivery = "inline_image" | "inline_document" | "path";
export type DeskStatus = "idle" | "thinking" | "waiting_permission" | "error" | "closed";
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";
export type OfficeEvent =
  | { seq: number; ts: number; type: "user"; text: string; attachments?: Attachment[] }
```


## Blocos renderizáveis da conversa — `lib/timeline.ts`

```ts
export type Item =
  | { kind: "user"; key: string; text: string; attachments: Attachment[] }
```


## Controle de versão — `lib/git.ts`

```ts
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
export interface GitFile {
  path: string;
  /** Two-letter porcelain code, e.g. "M." staged-modified, ".M" worktree-modified. */
  code: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  label: string;
}
export interface Commit {
  hash: string;
  short: string;
  author: string;
  date: string;
  subject: string;
}
```


## Uso — `lib/usage.ts`

```ts
export interface UsageReport {
  fiveHour: Window;
  weekly: Window;
  today: Bucket;
  week: Bucket;
  total: Bucket;
  days: Bucket[];
  byModel: { model: string; turns: number; tokens: number; durationMs: number }[];
  byDesk: { deskId: string; deskName: string; turns: number; durationMs: number; tokens: number }[];
  firstEntry: number | null;
  lastEntry: number | null;
}
/** A rolling window, matching how Claude Code's own limits are measured. */
export interface Window {
  label: string;
  workedMs: number;
  percent: number;
  turns: number;
  tokens: number;
  resetAt: number | null;
  windowMs: number;
}
export interface Bucket {
  label: string;
  date: string;
  durationMs: number;
  turns: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
}
```


## Rotas que alimentam a interface

| Rota | Devolve |
|---|---|
| `GET /api/desks` | `DeskSummary[]` — todas as mesas |
| `GET /api/desks/[id]` | mesa, `DeskInit`, todos os eventos, permissões pendentes |
| `GET /api/desks/[id]/stream` | SSE: cada `OfficeEvent` conforme acontece |
| `POST /api/desks/[id]/message` | envia texto e anexos |
| `POST /api/desks/[id]/permission` | responde allow / always / deny |
| `POST /api/desks/[id]/control` | interrupt, model, permissionMode, rename, read |
| `POST /api/desks/[id]/upload` | um arquivo como corpo cru, devolve `Attachment` |
| `GET /api/file?path=` | serve um anexo, com suporte a Range (vídeo) |
| `GET /api/usage` | `UsageReport` |
| `GET/POST /api/git?desk=` | `GitStatus` e as ações de git |
| `GET /api/fs?path=` | navegador de diretórios |
