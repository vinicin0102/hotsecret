import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ paused: z.boolean() });

// Assumir a conversa (a IA para neste contato) ou devolver para a IA
export default apiHandler({
  PUT: async (req) => {
    await requireAdmin(req);
    const { paused } = schema.parse(req.body);
    const contact = await prisma.whatsAppContact.update({ where: { id: String(req.query.id) }, data: { paused, pausedUntil: null } });
    return { contact: { id: contact.id, paused: contact.paused } };
  },
});
