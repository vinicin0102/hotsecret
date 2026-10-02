// Serve arquivos enviados ao disco local (quando não há Vercel Blob configurado).
import type { NextApiRequest, NextApiResponse } from "next";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_MIME, UPLOAD_DIR } from "@/services/storage";

const EXT_TO_MIME = Object.fromEntries(Object.entries(ALLOWED_MIME).map(([m, e]) => [e, m]));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = String(req.query.name ?? "");
  if (!/^[\w-]+\.(\w{2,5})$/.test(name)) return res.status(400).end();
  const mime = EXT_TO_MIME[name.split(".").pop()!];
  if (!mime) return res.status(404).end();
  const file = path.join(UPLOAD_DIR, name);
  try {
    const info = await stat(file);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", info.size);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    createReadStream(file).pipe(res);
  } catch {
    res.status(404).end();
  }
}
