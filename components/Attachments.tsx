"use client";

import { fileUrl } from "@/lib/client";
import type { Attachment, MediaKind } from "@/lib/types";

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const LABEL: Record<MediaKind, string> = {
  image: "IMG",
  video: "VID",
  audio: "AUD",
  document: "PDF",
  text: "TXT",
  file: "ARQ",
};

/** Small square badge standing in for a file with no visual preview. */
function Badge({ kind }: { kind: MediaKind }) {
  return <span className={`badge-kind k-${kind}`}>{LABEL[kind]}</span>;
}

/** Upload in progress, with the byte counter the browser reports. */
export interface Upload {
  id: string;
  name: string;
  size: number;
}

export function AttachmentTray({
  attachments,
  uploads,
  onRemove,
}: {
  attachments: Attachment[];
  uploads: Upload[];
  onRemove: (id: string) => void;
}) {
  if (!attachments.length && !uploads.length) return null;

  return (
    <div className="tray">
      {attachments.map((file) => (
        <div className="tray-item" key={file.id}>
          {file.kind === "image" ? (
            <img src={fileUrl(file.path)} alt={file.name} />
          ) : file.kind === "video" ? (
            <video src={fileUrl(file.path)} muted preload="metadata" />
          ) : (
            <Badge kind={file.kind} />
          )}
          <span className="tray-name" title={file.name}>
            {file.name}
          </span>
          <span className="tray-size">{formatSize(file.size)}</span>
          <button className="tray-x" onClick={() => onRemove(file.id)} title="Remover">
            ×
          </button>
        </div>
      ))}
      {uploads.map((u) => (
        <div className="tray-item loading" key={u.id}>
          <span className="spinner" />
          <span className="tray-name">{u.name}</span>
          <span className="tray-size">{formatSize(u.size)}</span>
        </div>
      ))}
    </div>
  );
}

/** Attachments as they appear inside a sent message. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="msg-files">
      {attachments.map((file) => {
        const src = fileUrl(file.path);

        if (file.kind === "image") {
          return (
            <a key={file.id} href={src} target="_blank" rel="noreferrer" className="msg-media">
              <img className="msg-image" src={src} alt={file.name} />
            </a>
          );
        }

        if (file.kind === "video") {
          return (
            <div className="msg-media" key={file.id}>
              <video className="msg-video" src={src} controls preload="metadata" playsInline />
              <span className="msg-caption">
                {file.name} · {formatSize(file.size)}
              </span>
            </div>
          );
        }

        if (file.kind === "audio") {
          return (
            <div className="msg-media audio" key={file.id}>
              <audio className="msg-audio" src={src} controls preload="metadata" />
              <span className="msg-caption">
                {file.name} · {formatSize(file.size)}
              </span>
            </div>
          );
        }

        return (
          <a className="msg-file" key={file.id} href={src} target="_blank" rel="noreferrer">
            <Badge kind={file.kind} />
            <span className="tray-name">{file.name}</span>
            <span className="tray-size">{formatSize(file.size)}</span>
          </a>
        );
      })}
    </div>
  );
}
