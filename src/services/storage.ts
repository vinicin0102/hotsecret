// Upload de mídia: Vercel Blob (se BLOB_READ_WRITE_TOKEN) ou disco local em public/uploads.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { withBase } from "@/lib/paths";

export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/wav": "wav",
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Confere a assinatura binária (magic bytes) para não confiar apenas no Content-Type. */
export function sniffMatches(mime: string, buf: Buffer): boolean {
  const hex = buf.subarray(0, 12).toString("hex");
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/png") return hex.startsWith("89504e47");
  if (mime === "image/gif") return hex.startsWith("47494638");
  if (mime === "image/webp") return hex.startsWith("52494646") && buf.subarray(8, 12).toString() === "WEBP";
  if (mime === "video/mp4" || mime === "audio/mp4") return buf.subarray(4, 8).toString() === "ftyp";
  if (mime === "video/webm" || mime === "audio/webm") return hex.startsWith("1a45dfa3");
  if (mime === "audio/mpeg") return hex.startsWith("494433") || hex.startsWith("fff");
  if (mime === "audio/ogg") return buf.subarray(0, 4).toString() === "OggS";
  if (mime === "audio/wav") return buf.subarray(0, 4).toString() === "RIFF";
  return false;
}

export async function storeFile(buf: Buffer, mime: string): Promise<string> {
  const ext = ALLOWED_MIME[mime];
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const res = await fetch(`https://blob.vercel-storage.com/hot-secret/${name}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        "x-api-version": "7",
        "x-content-type": mime,
        "x-add-random-suffix": "0",
      },
      body: new Uint8Array(buf),
    });
    if (!res.ok) throw new Error(`Falha no upload (Blob ${res.status})`);
    const data = (await res.json()) as { url: string };
    return data.url;
  }
  const dir = UPLOAD_DIR;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return withBase(`/api/uploads/${name}`);
}
