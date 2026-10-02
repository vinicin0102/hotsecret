// Upload de mídia do painel, em ordem de preferência:
// 1. Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY): o navegador envia direto, sem limite da Vercel
// 2. Vercel Blob (BLOB_READ_WRITE_TOKEN)
// 3. Banco de dados (tabela media) — funciona em qualquer lugar, ideal para imagens pequenas
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { withBase } from "@/lib/paths";

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
/** Corpo máximo aceito pelas funções da Vercel (~4,5 MB). */
export const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;

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

// ---------- Supabase Storage (upload direto do navegador com URL assinada) ----------
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "hotsecret";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

let bucketReady = false;
async function ensureBucket(cfg: { url: string; key: string }) {
  if (bucketReady) return;
  const res = await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_UPLOAD_BYTES }),
  });
  // 200 = criado; 400/409 = já existe
  if (res.ok || res.status === 400 || res.status === 409) bucketReady = true;
  else throw new Error(`Supabase Storage respondeu ${res.status}`);
}

export interface UploadTicket {
  mode: "direct" | "server";
  uploadUrl?: string;
  publicUrl?: string;
  maxServerBytes: number;
}

/** Decide como o navegador deve enviar o arquivo. */
export async function createUploadTicket(mime: string): Promise<UploadTicket> {
  const maxServerBytes = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL ? MAX_SERVER_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  const cfg = supabaseConfig();
  if (!cfg) return { mode: "server", maxServerBytes };
  try {
    await ensureBucket(cfg);
    const path = `uploads/${Date.now()}-${randomBytes(8).toString("hex")}.${ALLOWED_MIME[mime]}`;
    const res = await fetch(`${cfg.url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`assinatura ${res.status}`);
    const data = (await res.json()) as { url?: string; signedUrl?: string };
    const signed = data.url ?? data.signedUrl;
    if (!signed) throw new Error("resposta sem url");
    return {
      mode: "direct",
      uploadUrl: `${cfg.url}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`,
      publicUrl: `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`,
      maxServerBytes,
    };
  } catch (err) {
    console.error("[storage] Supabase indisponível, usando upload pelo servidor", err);
    return { mode: "server", maxServerBytes };
  }
}

/** Upload recebido pelo servidor: Vercel Blob ou banco de dados. */
export async function storeFile(buf: Buffer, mime: string): Promise<string> {
  const ext = ALLOWED_MIME[mime];
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
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
    return ((await res.json()) as { url: string }).url;
  }
  const media = await prisma.media.create({ data: { mime, size: buf.length, data: new Uint8Array(buf) } });
  return withBase(`/api/uploads/${media.id}.${ext}`);
}
