// Inicia (ou retoma) a sessão do visitante: cria lead + conversa, captura UTM/dispositivo e registra page_view.
import { z } from "zod";
import { apiHandler, getClientIp, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { signLeadToken, verifyLeadToken } from "@/lib/auth";
import { parseUserAgent } from "@/lib/device";
import { sanitizeText, sanitizeUrl } from "@/lib/sanitize";
import { trackEvent } from "@/services/tracking";
import { checkRecoveryFor } from "@/services/recovery";
import { publicPayment } from "@/services/payments/service";
import { publicMessage } from "@/services/conversation";

const schema = z.object({
  funnelId: z.string().max(64),
  token: z.string().max(2000).optional().nullable(),
  restart: z.boolean().optional(),
  preview: z.boolean().optional(),
  experimentId: z.string().max(64).optional().nullable(),
  variantId: z.string().max(64).optional().nullable(),
  utm: z
    .object({
      utm_source: z.string().max(200).optional(),
      utm_medium: z.string().max(200).optional(),
      utm_campaign: z.string().max(200).optional(),
      utm_content: z.string().max(200).optional(),
      utm_term: z.string().max(200).optional(),
    })
    .partial()
    .default({}),
  referrer: z.string().max(1000).optional().nullable(),
  landingPage: z.string().max(1000).optional().nullable(),
});

/** fbclid do anúncio → cookie fbc no formato da Meta (fb.1.<timestamp>.<fbclid>). */
function fbcFromLanding(landing?: string | null): string | null {
  try {
    const id = landing ? new URL(landing).searchParams.get("fbclid") : null;
    return id && /^[\w-]{10,300}$/.test(id) ? `fb.1.${Date.now()}.${id}` : null;
  } catch {
    return null;
  }
}

const t = (v?: string | null) => (v ? sanitizeText(v, 200) || null : null);

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "session", 30, 60_000);
    const body = schema.parse(req.body);
    const funnel = await prisma.funnel.findUnique({ where: { id: body.funnelId }, select: { id: true, status: true } });
    if (!funnel || funnel.status !== "PUBLISHED") throw new HttpError(404, "Fluxo indisponível");

    // Retomar conversa existente
    const existing = await verifyLeadToken(body.token);
    if (existing && existing.funnelId === funnel.id) {
      const lead = await prisma.lead.findUnique({ where: { id: existing.leadId } });
      if (lead) {
        let conversationId = existing.conversationId;
        if (body.restart) {
          const conv = await prisma.conversation.create({ data: { leadId: lead.id, funnelId: funnel.id } });
          conversationId = conv.id;
        }
        await trackEvent({ leadId: lead.id, funnelId: funnel.id, conversationId, type: "page_view", data: { resumed: !body.restart } });
        await checkRecoveryFor(conversationId);
        const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { messages: { orderBy: { createdAt: "asc" }, take: 500 }, payments: { orderBy: { createdAt: "desc" }, take: 5 } },
        });
        if (conv) {
          const token = await signLeadToken({ leadId: lead.id, conversationId, funnelId: funnel.id });
          return {
            token,
            resumed: !body.restart && conv.messages.length > 0,
            conversation: { id: conv.id, status: conv.status, currentNodeId: conv.currentNodeId },
            messages: conv.messages.map(publicMessage),
            payments: conv.payments.map(publicPayment),
          };
        }
      }
    }

    // Variante de A/B só é aceita se pertencer ao experimento e ao fluxo
    let experimentId: string | null = null;
    let variantId: string | null = null;
    if (body.experimentId && body.variantId) {
      const v = await prisma.experimentVariant.findFirst({
        where: { id: body.variantId, experimentId: body.experimentId, funnelId: funnel.id },
      });
      if (v) {
        experimentId = v.experimentId;
        variantId = v.id;
      }
    }

    const ua = parseUserAgent(req.headers["user-agent"]);
    const country =
      (req.headers["x-vercel-ip-country"] as string) || (req.headers["cf-ipcountry"] as string) || null;
    const lead = await prisma.lead.create({
      data: {
        funnelId: funnel.id,
        utmSource: t(body.utm.utm_source),
        utmMedium: t(body.utm.utm_medium),
        utmCampaign: t(body.utm.utm_campaign),
        utmContent: t(body.utm.utm_content),
        utmTerm: t(body.utm.utm_term),
        referrer: sanitizeUrl(body.referrer) || null,
        landingPage: sanitizeUrl(body.landingPage) || null,
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
        country: country ? sanitizeText(country, 8) : null,
        experimentId,
        variantId,
        fbc: fbcFromLanding(body.landingPage),
        clientIp: getClientIp(req).slice(0, 64),
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
      },
    });
    const conversation = await prisma.conversation.create({ data: { leadId: lead.id, funnelId: funnel.id } });
    await trackEvent({
      leadId: lead.id,
      funnelId: funnel.id,
      conversationId: conversation.id,
      type: "page_view",
      data: { ...body.utm, referrer: lead.referrer, landingPage: lead.landingPage, device: ua.device, browser: ua.browser, country },
    });
    const token = await signLeadToken({ leadId: lead.id, conversationId: conversation.id, funnelId: funnel.id });
    return {
      token,
      resumed: false,
      conversation: { id: conversation.id, status: conversation.status, currentNodeId: null },
      messages: [],
      payments: [],
    };
  },
});
