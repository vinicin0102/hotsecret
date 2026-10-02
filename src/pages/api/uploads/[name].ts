// Serve arquivos guardados no banco (quando não há storage externo).
// Suporta Range (206): o Safari/iPhone só reproduz vídeo e áudio com respostas parciais.
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const match = /^([a-z0-9]{10,40})\.\w{2,5}$/.exec(String(req.query.name ?? ""));
  if (!match) return res.status(404).end();
  const media = await prisma.media.findUnique({ where: { id: match[1] } });
  if (!media) return res.status(404).end();
  const data = Buffer.from(media.data);
  const total = data.length;

  res.setHeader("Content-Type", media.mime);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : total - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end || start >= total) {
      res.setHeader("Content-Range", `bytes */${total}`);
      return res.status(416).end();
    }
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", end - start + 1);
    return res.status(206).send(data.subarray(start, end + 1));
  }
  res.setHeader("Content-Length", total);
  return res.status(200).send(data);
}
