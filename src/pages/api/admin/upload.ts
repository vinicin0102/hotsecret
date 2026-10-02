import type { NextApiRequest, NextApiResponse } from "next";
import { HttpError, rateLimit, requireAdmin } from "@/lib/api";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, sniffMatches, storeFile } from "@/services/storage";

// Fallback do upload direto (Supabase): o arquivo passa pelo servidor e vai para o Blob ou para o banco.

export const config = { api: { bodyParser: false } };

// Upload binário direto (corpo = arquivo, Content-Type = mime). Evita dependências de multipart.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
    await requireAdmin(req);
    rateLimit(req, "upload", 60, 60_000);
    const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim();
    if (!ALLOWED_MIME[mime]) throw new HttpError(415, "Tipo de arquivo não permitido");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Arquivo maior que 25MB");
      chunks.push(Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    if (!sniffMatches(mime, buf)) throw new HttpError(415, "Conteúdo do arquivo não corresponde ao tipo");
    const url = await storeFile(buf, mime);
    res.status(200).json({ url });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error("[upload]", err);
    res.status(status).json({ error: err instanceof Error && status !== 500 ? err.message : "Erro no upload" });
  }
}
