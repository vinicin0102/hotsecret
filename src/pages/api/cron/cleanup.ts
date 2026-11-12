// Limpeza automática do banco (Vercel Cron, de madrugada): o mesmo plano seguro do "Limpar tudo" do painel
// — registros de webhook e eventos antigos, arquivos sem uso. Leads nunca são apagados aqui.
// Chamada com "Authorization: Bearer <CRON_SECRET>".
import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual } from "node:crypto";
import { runAutoCleanup } from "@/services/db-cleanup";
import { localDay, syncAdSpend } from "@/services/ads/meta-ads";

export const config = { maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization ?? "");
  const expected = `Bearer ${secret}`;
  const ok = !!secret && auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return res.status(401).json({ error: "não autorizado" });
  const deleted = await runAutoCleanup();
  // tela Anúncios: o gasto final dos últimos 3 dias (a Meta ainda ajusta o de ontem durante a madrugada)
  const ads = await syncAdSpend(localDay(-2), localDay(0)).catch((e) => ({ rows: 0, errors: [{ account: "Meta", error: e instanceof Error ? e.message : "erro" }] }));
  return res.status(200).json({ deleted, ads: { rows: ads.rows, errors: ads.errors.length } });
}
