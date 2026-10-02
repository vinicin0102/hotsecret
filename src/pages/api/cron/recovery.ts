// Varredura de recuperação de checkout. Configure um cron (ex.: Vercel Cron a cada 5 min)
// enviando "Authorization: Bearer <CRON_SECRET>".
import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual } from "node:crypto";
import { processDueRecoveries } from "@/services/recovery";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization ?? "");
  const expected = `Bearer ${secret}`;
  const ok = !!secret && auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return res.status(401).json({ error: "não autorizado" });
  const result = await processDueRecoveries();
  return res.status(200).json(result);
}
