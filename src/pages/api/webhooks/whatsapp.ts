// Webhook do WhatsApp (Evolution API ou uazapi): mensagens recebidas → o Cérebro responde.
// O endereço leva um token derivado da chave; sem ele, nada é processado.
import { timingSafeEqual } from "node:crypto";
import { apiHandler, HttpError } from "@/lib/api";
import { waConfig, webhookToken } from "@/services/whatsapp/client";
import { handleWhatsAppWebhook } from "@/services/whatsapp/bot";

export const config = { maxDuration: 60 };

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default apiHandler({
  POST: async (req) => {
    const cfg = waConfig();
    if (!cfg) throw new HttpError(503, "WhatsApp não configurado");
    if (!same(String(req.query.token ?? ""), webhookToken(cfg))) throw new HttpError(401, "Token inválido");
    // Evolution: outra instância apontando para este endereço → ignora
    const inst = (req.body as { instance?: unknown } | undefined)?.instance;
    if (cfg.provider === "evolution" && typeof inst === "string" && inst && inst !== cfg.instance) return { ok: true, ignored: true };
    await handleWhatsAppWebhook(req.body);
    return { ok: true };
  },
});
