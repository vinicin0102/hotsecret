import { z } from "zod";
import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        funnel: { select: { id: true, name: true, slug: true } },
        tags: { include: { tag: true } },
        payments: { orderBy: { createdAt: "desc" }, include: { product: { select: { name: true } } } },
        conversations: {
          orderBy: { startedAt: "asc" },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        },
        events: { orderBy: { createdAt: "asc" }, take: 500 },
      },
    });
    if (!lead) throw new HttpError(404, "Lead não encontrado");
    const nodes = lead.funnelId
      ? await prisma.funnelNode.findMany({ where: { funnelId: lead.funnelId }, select: { id: true, type: true, settings: true } })
      : [];
    return { lead, nodes };
  },
  PATCH: async (req) => {
    await requireAdmin(req);
    const body = z
      .object({
        name: z.string().max(120).optional(),
        email: z.string().max(160).optional(),
        phone: z.string().max(30).optional(),
        stage: z.enum(["NEW", "INTERESTED", "CHECKOUT", "BUYER", "ABANDONED"]).optional(),
      })
      .parse(req.body);
    const lead = await prisma.lead.update({
      where: { id: String(req.query.id) },
      data: {
        ...(body.name !== undefined ? { name: sanitizeText(body.name, 120) || null } : {}),
        ...(body.email !== undefined ? { email: sanitizeText(body.email, 160) || null } : {}),
        ...(body.phone !== undefined ? { phone: sanitizeText(body.phone, 30) || null } : {}),
        ...(body.stage ? { stage: body.stage } : {}),
      },
    });
    return { lead };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.lead.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
