import type { Message } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api";
import { verifyLeadToken, type LeadSession } from "@/lib/auth";

export async function requireLeadSession(token: unknown): Promise<LeadSession> {
  const s = await verifyLeadToken(token);
  if (!s) throw new HttpError(401, "Sessão expirada");
  return s;
}

export function publicMessage(m: Message) {
  return { id: m.id, sender: m.sender, type: m.type, content: m.content, nodeId: m.nodeId, createdAt: m.createdAt };
}

export async function conversationSnapshot(conversationId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 500 },
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  return conv;
}
