// Foto enviada pelo lead no chat (câmera ou galeria). O navegador comprime antes de enviar.
import type { NextApiRequest, NextApiResponse } from "next";
import { assertSameOrigin, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import { addConversationMessage } from "@/services/payments/service";
import { trackEvent } from "@/services/tracking";
import { LEAD_PHOTO_MIME, MAX_LEAD_PHOTO_BYTES, sniffMatches, storeLeadPhoto } from "@/services/storage";

export const config = { api: { bodyParser: false } };

/** fotos por conversa */
const MAX_PHOTOS = 30;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
    assertSameOrigin(req);
    rateLimit(req, "lead-photo", 10, 60_000);
    const session = await requireLeadSession(req.headers["x-lead-token"]);
    const nodeId = String(req.query.nodeId ?? "");
    if (!/^[a-zA-Z0-9_:-]{1,64}$/.test(nodeId)) throw new HttpError(400, "Bloco inválido");
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    // só onde o lead pode responder: Cérebro, pergunta ou botões
    if (!node || !["ai", "question", "buttons"].includes(node.type)) throw new HttpError(404, "Bloco não encontrado");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");

    const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim();
    if (!LEAD_PHOTO_MIME.includes(mime as (typeof LEAD_PHOTO_MIME)[number])) throw new HttpError(415, "Envie uma foto (JPG, PNG ou WEBP)");
    const sent = await prisma.message.count({ where: { conversationId: session.conversationId, sender: "user", type: "image" } });
    if (sent >= MAX_PHOTOS) throw new HttpError(429, "Limite de fotos desta conversa atingido");

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_LEAD_PHOTO_BYTES) throw new HttpError(413, "Foto grande demais");
      chunks.push(Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    if (!buf.length || !sniffMatches(mime, buf)) throw new HttpError(415, "Arquivo não é uma foto válida");

    const url = await storeLeadPhoto(buf, mime);
    await addConversationMessage(session.conversationId, "user", "image", { url, caption: "" }, node.id);
    await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: "photo_sent", nodeId: node.id, data: { url } });
    res.status(200).json({ url });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error("[photo]", err);
    res.status(status).json({ error: err instanceof Error && status !== 500 ? err.message : "Não foi possível enviar a foto" });
  }
}
