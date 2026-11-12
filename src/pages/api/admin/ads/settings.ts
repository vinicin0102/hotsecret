// Tela Anúncios → Conectar contas: token de acesso (ads_read) e contas de anúncios. O token nunca volta.
import { z } from "zod";
import { HttpError, apiHandler, requireAdmin } from "@/lib/api";
import { checkAccount, getAdsSettings, normalizeAccountId, saveAdsSettings, sealToken, tokenOf, type AdAccount } from "@/services/ads/meta-ads";
import { openSecret } from "@/lib/secret-box";

const schema = z.object({
  /** undefined = manter; "" = remover; texto = novo */
  token: z.string().trim().max(1000).optional(),
  accounts: z.array(z.string().trim().max(200)).max(30),
  feePercent: z.number().min(0).max(50).optional(),
  taxPercent: z.number().min(0).max(50).optional(),
  feeFixed: z.number().int().min(0).max(100_000).optional(),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const s = await getAdsSettings();
    const token = s.tokenSealed ? openSecret(s.tokenSealed) : null;
    return {
      accounts: s.accounts.map((a) => ({ id: a.id, name: a.name ?? "", currency: a.currency ?? "" })),
      tokenConfigured: !!token,
      tokenHint: token ? `…${token.slice(-4)}` : "",
      feePercent: s.feePercent ?? 0,
      taxPercent: s.taxPercent ?? 0,
      feeFixed: s.feeFixed ?? 0,
      lastSyncAt: s.lastSyncAt ?? null,
    };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const body = schema.parse(req.body);
    const cur = await getAdsSettings();
    const next = { ...cur, feePercent: body.feePercent ?? cur.feePercent, taxPercent: body.taxPercent ?? cur.taxPercent, feeFixed: body.feeFixed ?? cur.feeFixed };
    if (body.token !== undefined) next.tokenSealed = body.token ? sealToken(body.token) : undefined;
    const ids = [...new Set(body.accounts.filter(Boolean).map((v) => normalizeAccountId(v)))];
    if (ids.some((v) => !v)) throw new HttpError(400, "Conta de anúncios inválida: use o ID (ex.: act_123456789 ou só os números).");
    // confere cada conta com o token (nome e moeda vêm da Meta); conta nova sem acesso não é salva
    const old = new Map(cur.accounts.map((a) => [a.id, a]));
    const accounts: AdAccount[] = [];
    const problems: string[] = [];
    for (const id of ids as string[]) {
      const base: AdAccount = { ...(old.get(id) ?? { id }) };
      const token = tokenOf(next, base);
      if (!token) {
        problems.push(`${id}: cadastre o token de acesso`);
        continue;
      }
      try {
        const info = await checkAccount(id, token);
        accounts.push({ ...base, name: info.name, currency: info.currency });
      } catch (e) {
        problems.push(`${id}: ${e instanceof Error ? e.message : "sem acesso"}`);
      }
    }
    // contas que mudaram: o gasto é buscado de novo
    const changed = accounts.some((a) => !old.has(a.id));
    await saveAdsSettings({ ...next, accounts, ...(changed ? { syncedSince: undefined } : {}) });
    return { ok: problems.length === 0, problems, accounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })) };
  },
});
