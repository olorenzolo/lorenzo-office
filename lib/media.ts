import path from "node:path";
import type { Delivery, MediaKind } from "./types";

/**
 * The Messages API accepts only these image formats inline. Anything else —
 * including SVG and HEIC — is handed over as a path for the agent to open.
 */
const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Images above this go by path instead of inline: the API rejects oversized
 * images, and the Read tool downsizes them on the way in — the same thing the
 * terminal does with a big screenshot.
 */
const MAX_INLINE_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_INLINE_PDF_BYTES = 20 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".yaml", ".yml",
  ".xml", ".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go",
  ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".sh", ".zsh", ".sql",
  ".env", ".toml", ".ini", ".conf", ".log",
]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".aiff"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".heic", ".bmp", ".tiff"]);

/** Browsers often send an empty or generic type; the extension is the fallback. */
export function classify(
  name: string,
  mediaType: string,
  size: number,
): { kind: MediaKind; delivery: Delivery; mediaType: string } {
  const ext = path.extname(name).toLowerCase();
  let type = mediaType && mediaType !== "application/octet-stream" ? mediaType : "";

  if (!type) {
    if (VIDEO_EXTENSIONS.has(ext)) type = `video/${ext.slice(1)}`;
    else if (AUDIO_EXTENSIONS.has(ext)) type = `audio/${ext.slice(1)}`;
    else if (ext === ".png") type = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") type = "image/jpeg";
    else if (ext === ".gif") type = "image/gif";
    else if (ext === ".webp") type = "image/webp";
    else if (ext === ".pdf") type = "application/pdf";
    else if (TEXT_EXTENSIONS.has(ext)) type = "text/plain";
    else type = "application/octet-stream";
  }

  if (type.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) {
    return { kind: "video", delivery: "path", mediaType: type };
  }
  if (type.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext)) {
    return { kind: "audio", delivery: "path", mediaType: type };
  }
  if (type === "application/pdf" || ext === ".pdf") {
    return {
      kind: "document",
      delivery: size <= MAX_INLINE_PDF_BYTES ? "inline_document" : "path",
      mediaType: "application/pdf",
    };
  }
  if (type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
    const inline = INLINE_IMAGE_TYPES.has(type) && size <= MAX_INLINE_IMAGE_BYTES;
    return { kind: "image", delivery: inline ? "inline_image" : "path", mediaType: type };
  }
  if (type.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
    return { kind: "text", delivery: "path", mediaType: type };
  }
  return { kind: "file", delivery: "path", mediaType: type };
}

/** What the agent is told it can do with a file it received as a path. */
export function pathHint(kind: MediaKind): string {
  switch (kind) {
    case "video":
      return "vídeo — use ffprobe para inspecionar e ffmpeg para extrair frames, áudio ou trechos";
    case "audio":
      return "áudio — use ffprobe/ffmpeg para inspecionar, converter ou extrair trechos";
    case "image":
      return "imagem — abra com a ferramenta Read para vê-la";
    case "document":
      return "PDF — abra com a ferramenta Read";
    case "text":
      return "texto — abra com a ferramenta Read";
    default:
      return "abra com a ferramenta Read";
  }
}
