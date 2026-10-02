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
        zuckpayCredentials:
          !!(process.env.ZUCKPAY_CLIENT_ID || process.env.CLIENT_ID) && !!(process.env.ZUCKPAY_CLIENT_SECRET || process.env.CLIENT_SECRET),
        zuckpayWebhookSecret: !!process.env.ZUCKPAY_WEBHOOK_SECRET,
        payerData: !!process.env.CHECKOUT_PAYER_CPF && !!process.env.CHECKOUT_PAYER_PHONE,
        supabaseStorage: !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
        mercadopagoToken: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
        mercadopagoWebhookSecret: !!process.env.MERCADOPAGO_WEBHOOK_SECRET,
        cronSecret: !!process.env.CRON_SECRET,
        blobStorage: !!process.env.BLOB_READ_WRITE_TOKEN,
        authSecret: !!process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32,
      },
    };
  },
});
