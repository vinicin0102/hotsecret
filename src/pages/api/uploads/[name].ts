// Serve arquivos guardados no banco (quando não há storage externo).
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const match = /^([a-z0-9]{10,40})\.\w{2,5}$/.exec(String(req.query.name ?? ""));
  if (!match) return res.status(404).end();
  const media = await prisma.media.findUnique({ where: { id: match[1] } });
  if (!media) return res.status(404).end();
  res.setHeader("Content-Type", media.mime);
  res.setHeader("Content-Length", media.size);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(Buffer.from(media.data));
}
