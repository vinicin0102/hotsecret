// Saúde do site para monitor externo (UptimeRobot, Better Stack…): 200 com o banco respondendo, 503 sem ele.
// Público e barato (um SELECT 1); não expõe nada além de ok/tempo.
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

const TIMEOUT_MS = 8000;

export default async function health(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const started = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return res.status(200).json({ ok: true, db: "ok", ms: Date.now() - started });
  } catch (e) {
    console.error("[health] banco sem resposta", e instanceof Error ? e.message.slice(0, 200) : e);
    return res.status(503).json({ ok: false, db: "down", ms: Date.now() - started });
  }
}
