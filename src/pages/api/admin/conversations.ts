import { apiHandler, queryString, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const funnelId = queryString(req.query.funnelId);
    const page = Math.max(1, Number(queryString(req.query.page) ?? 1) || 1);
    const conversations = await prisma.conversation.findMany({
      where: { ...(funnelId ? { funnelId } : {}), messages: { some: {} } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * 40,
      take: 40,
      include: {
        lead: { select: { id: true, name: true, email: true, stage: true, utmSource: true } },
        funnel: { select: { name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        lead: c.lead,
        funnel: c.funnel?.name ?? "—",
        status: c.status,
        messageCount: c._count.messages,
        lastMessage: c.messages[0] ?? null,
        startedAt: c.startedAt,
        updatedAt: c.updatedAt,
      })),
    };
  },
});
