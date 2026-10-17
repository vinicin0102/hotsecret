// Grupo VIP (página pública): abre/retoma a sessão do visitante e devolve o perfil, os posts e os pagamentos dele.
// Post bloqueado vem só com a prévia borrada; a mídia real só depois do pagamento aprovado.
import { z } from "zod";
import { apiHandler, leadRateLimit } from "@/lib/api";
import { adminPreview, findGroup, vipSession, vipState } from "@/services/vip";

const utmValue = z.string().max(5000).transform((v) => v.slice(0, 500)).optional().catch(undefined);
const schema = z.object({
  token: z.string().max(2000).optional().nullable(),
  /** token entregue pelo chat junto com o link do grupo (mesmo lead) */
  acesso: z.string().max(2000).optional().nullable(),
  utm: z.object({ utm_source: utmValue, utm_medium: utmValue, utm_campaign: utmValue, utm_content: utmValue, utm_term: utmValue }).partial().default({}),
  referrer: z.string().max(1000).optional().nullable(),
  landingPage: z.string().max(1000).optional().nullable(),
});

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "vip", 60, 60_000);
    const body = schema.parse(req.body);
    const group = await findGroup(String(req.query.slug), await adminPreview(req));
    const s = await vipSession(req, group, body);
    return { token: s.token, ...(await vipState(group, s.leadId)) };
  },
});
