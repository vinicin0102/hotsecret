// Vídeo de visualização única: entrega o link UMA vez por lead (no play) e marca como visualizado.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import { trackEvent } from "@/services/tracking";

const schema = z.object({ token: z.string().min(10).max(2000), nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/) });
const OPENED = "video_once_opened";

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "view-once", 30, 60_000);
    const { token, nodeId } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    const content = (node?.content ?? {}) as { url?: string; viewOnce?: boolean };
    if (!node || node.type !== "video" || !content.viewOnce || !content.url) throw new HttpError(404, "Vídeo indisponível");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");

    const already = await prisma.event.findFirst({
      where: { leadId: session.leadId, funnelId: session.funnelId, nodeId, type: OPENED },
      select: { id: true },
    });
    if (already) throw new HttpError(410, "Este vídeo já foi visualizado");

    await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: OPENED, nodeId });
    // a conversa salva passa a mostrar "já visualizado" (sem o link) ao retomar
    await prisma.message.updateMany({
      where: { conversationId: session.conversationId, nodeId, type: "video" },
      data: { content: { ...content, url: "", viewed: true } as Prisma.InputJsonValue },
    });
    return { url: content.url };
  },
});
