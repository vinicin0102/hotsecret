// Limpeza automática do banco (Vercel Cron, de madrugada): o mesmo plano seguro do "Limpar tudo" do painel
// — registros de webhook e eventos antigos, arquivos sem uso. Leads nunca são apagados aqui.
// Chamada com "Authorization: Bearer <CRON_SECRET>".
import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual } from "node:crypto";
import { runAutoCleanup } from "@/services/db-cleanup";

export const config = { maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization ?? "");
  const expected = `Bearer ${secret}`;
  const ok = !!secret && auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return res.status(401).json({ error: "não autorizado" });
  return res.status(200).json({ deleted: await runAutoCleanup() });
}
