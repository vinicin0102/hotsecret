// Webhook da Evolution API (WhatsApp): mensagens recebidas → o Cérebro responde.
// O endereço leva um token derivado da chave da Evolution; sem ele, nada é processado.
import { timingSafeEqual } from "node:crypto";
import { apiHandler, HttpError } from "@/lib/api";
import { evolutionConfig, webhookToken } from "@/services/whatsapp/evolution";
import { handleEvolutionWebhook } from "@/services/whatsapp/bot";

export const config = { maxDuration: 60 };

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default apiHandler({
  POST: async (req) => {
    const cfg = evolutionConfig();
    if (!cfg) throw new HttpError(503, "WhatsApp não configurado");
    if (!same(String(req.query.token ?? ""), webhookToken(cfg))) throw new HttpError(401, "Token inválido");
    // outra instância apontando para este endereço: ignora
    const inst = (req.body as { instance?: unknown } | undefined)?.instance;
    if (typeof inst === "string" && inst && inst !== cfg.instance) return { ok: true, ignored: true };
    await handleEvolutionWebhook(req.body);
    return { ok: true };
  },
});
