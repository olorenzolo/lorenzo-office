import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { office, UPLOAD_DIR } from "@/lib/office";
import { classify } from "@/lib/media";
import type { Attachment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Generous: a screen recording is easily hundreds of megabytes. */
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Takes ONE file as the raw request body, streamed straight to disk. Sending it
 * as a multipart form instead would buffer the whole file in memory first,
 * which a video would not survive.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const desk = office.get(id);
  if (!desk) return NextResponse.json({ error: "desk not found" }, { status: 404 });
  if (!req.body) return NextResponse.json({ error: "empty body" }, { status: 400 });

  const url = new URL(req.url);
  // basename plus separator stripping: the name must never escape the folder.
  const safeName = path
    .basename(url.searchParams.get("name") || "arquivo")
    .replace(/[/\\]/g, "_")
    .slice(0, 180);
  const declaredType = url.searchParams.get("type") || "";

  const dir = path.join(UPLOAD_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  const attachmentId = randomUUID().slice(0, 8);
  const target = path.join(dir, `${attachmentId}-${safeName}`);

  let written = 0;
  const counter = new TransformStream({
    transform(chunk: Uint8Array, controller) {
      written += chunk.byteLength;
      if (written > MAX_BYTES) throw new Error("arquivo acima de 2 GB");
      controller.enqueue(chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(req.body.pipeThrough(counter) as Parameters<typeof Readable.fromWeb>[0]),
      fs.createWriteStream(target),
    );
  } catch (err) {
    fs.rmSync(target, { force: true });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "falha ao gravar o arquivo" },
      { status: 413 },
    );
  }

  const { kind, delivery, mediaType } = classify(safeName, declaredType, written);
  const attachment: Attachment = {
    id: attachmentId,
    name: safeName,
    path: target,
    mediaType,
    size: written,
    kind,
    delivery,
  };

  return NextResponse.json({ attachment });
}
