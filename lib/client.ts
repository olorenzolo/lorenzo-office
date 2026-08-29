import type { Attachment, DeskSummary, OfficeEvent } from "./types";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return (await res.json()) as T;
}

export const listDesks = () => api<{ desks: DeskSummary[] }>("/api/desks");

export const createDesk = (body: Record<string, unknown>) =>
  api<{ desk: DeskSummary }>("/api/desks", { method: "POST", body: JSON.stringify(body) });

export const loadDesk = (id: string) =>
  api<{
    desk: DeskSummary;
    events: OfficeEvent[];
    pending: { id: string; tool: string; input: Record<string, unknown> }[];
  }>(`/api/desks/${id}`);

export const sendMessage = (id: string, text: string, attachments: Attachment[] = []) =>
  api(`/api/desks/${id}/message`, { method: "POST", body: JSON.stringify({ text, attachments }) });

export const answerPermission = (id: string, requestId: string, decision: "allow" | "always" | "deny") =>
  api(`/api/desks/${id}/permission`, { method: "POST", body: JSON.stringify({ requestId, decision }) });

export const control = (id: string, action: string, value?: string) =>
  api<{ desk: DeskSummary }>(`/api/desks/${id}/control`, {
    method: "POST",
    body: JSON.stringify({ action, value }),
  });

export const closeDesk = (id: string) => api(`/api/desks/${id}`, { method: "DELETE" });

export const browse = (path: string) =>
  api<{ path: string; parent: string | null; entries: { name: string; path: string }[] }>(
    `/api/fs?path=${encodeURIComponent(path)}`,
  );

/**
 * Uploads one file as the raw request body so the browser streams it — a
 * multipart form would have to hold the whole video in memory first.
 */
export async function uploadFile(deskId: string, file: File): Promise<Attachment> {
  const params = new URLSearchParams({ name: file.name, type: file.type || "" });
  const res = await fetch(`/api/desks/${deskId}/upload?${params}`, {
    method: "POST",
    body: file,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(safeError(detail) || `falha ao enviar ${file.name}`);
  }
  return ((await res.json()) as { attachment: Attachment }).attachment;
}

function safeError(body: string): string {
  try {
    return (JSON.parse(body) as { error?: string }).error ?? "";
  } catch {
    return "";
  }
}

export const fileUrl = (path: string) => `/api/file?path=${encodeURIComponent(path)}`;
