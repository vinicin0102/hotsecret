import { apiHandler, requireAdmin } from "@/lib/api";
import { absoluteUrl } from "@/lib/paths";
import { activeProviderName, sandboxAllowed } from "@/services/payments";

// Mostra apenas se as chaves estão configuradas — nunca os valores.
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const provider = activeProviderName();
    return {
      provider,
      sandbox: provider === "sandbox" && sandboxAllowed(),
      webhookUrl: absoluteUrl(`/api/webhooks/payments/${provider}`),
      cronUrl: absoluteUrl("/api/cron/recovery"),
      configured: {
        mercadopagoToken: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
        mercadopagoWebhookSecret: !!process.env.MERCADOPAGO_WEBHOOK_SECRET,
        cronSecret: !!process.env.CRON_SECRET,
        blobStorage: !!process.env.BLOB_READ_WRITE_TOKEN,
        authSecret: !!process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32,
      },
    };
  },
});
