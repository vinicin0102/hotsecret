// WhatsApp (Evolution API): a mensagem chega no webhook → lead/conversa do número → o Cérebro responde pela Evolution.
// Oferta vira cobrança (PIX) na própria conversa; pago, a entrega chega no WhatsApp.
import type { Payment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/paths";
import { formatMoney } from "@/lib/format";
import { brainOffers, publicOfferFormat, runBrain } from "@/services/ai/brain";
import { toTurns } from "@/services/ai/history";
import { addConversationMessage, chargeProduct, syncPaymentWithProvider } from "@/services/payments/service";
import { publicNextAction } from "@/services/payments/zenith";
import { trackEvent } from "@/services/tracking";
import { vipAccessUrl, vipPreviewCard, withVipAccess } from "@/services/vip";
import { evolutionConfig, sendAudio, sendMedia, sendText, type EvolutionConfig } from "./evolution";
import { incomingText, parseEvolutionWebhook, typingDelay, type IncomingMessage } from "./incoming";
import { getWhatsAppSettings, type WhatsAppSettings } from "./settings";

/** "nó" das mensagens do WhatsApp (não há fluxo: o Cérebro responde direto) */
export const WA_NODE = "whatsapp";
/** mensagens seguidas do lead viram uma resposta só: espera ele terminar de digitar */
const GATHER_MS = Number(process.env.WHATSAPP_GATHER_MS ?? 3500);
/** o dono respondeu pelo celular: a IA fica quieta neste contato por 12h */
const OWNER_PAUSE_MS = 12 * 60 * 60_000;

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** link público (arquivos enviados pelo painel ficam em /hot-secret/api/uploads/...) */
const publicUrl = (url: string) => (/^https?:\/\//.test(url) ? url : absoluteUrl(url.replace(/^\/hot-secret(?=\/)/, "")));

async function alreadyHave(conversationId: string | null, waId: string) {
  return !!(await prisma.message.findFirst({
    where: { ...(conversationId ? { conversationId } : {}), content: { path: ["waId"], equals: waId } },
    select: { id: true },
  }));
}

/** número novo: lead + conversa (sem fluxo) + contato */
async function contactFor(m: IncomingMessage) {
  const found = await prisma.whatsAppContact.findUnique({ where: { jid: m.jid } });
  if (found) {
    if ((m.name && m.name !== found.name) || (m.phone && m.phone !== found.phone))
      return prisma.whatsAppContact.update({ where: { id: found.id }, data: { name: m.name ?? found.name, phone: m.phone ?? found.phone } });
    return found;
  }
  const lead = await prisma.lead.create({
    data: { name: m.name, phone: m.phone, utmSource: "whatsapp", variables: { _whatsapp: m.jid } },
  });
  const conversation = await prisma.conversation.create({ data: { leadId: lead.id, funnelId: null, currentNodeId: WA_NODE } });
  try {
    return await prisma.whatsAppContact.create({ data: { jid: m.jid, phone: m.phone, name: m.name, leadId: lead.id, conversationId: conversation.id } });
  } catch {
    // duas mensagens ao mesmo tempo do mesmo número novo: fica o contato que chegou primeiro
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
    return (await prisma.whatsAppContact.findUnique({ where: { jid: m.jid } }))!;
  }
}

/** mensagem que nós mesmos enviamos (a Evolution devolve no webhook como fromMe) */
async function isOurEcho(conversationId: string, m: IncomingMessage) {
  if (await alreadyHave(conversationId, m.waId)) return true;
  const recent = await prisma.message.findMany({
    where: { conversationId, sender: "bot", createdAt: { gte: new Date(Date.now() - 3 * 60_000) } },
    select: { content: true },
  });
  return recent.some((r) => ((r.content as { text?: string })?.text ?? "").trim() === m.text.trim());
}

/**
 * Continua depois de responder o webhook: a Evolution recebe o "ok" na hora (e pode mandar a próxima mensagem do lead),
 * e a resposta da IA segue em segundo plano. Na Vercel, o waitUntil do contexto da requisição mantém a função viva até
 * terminar (o mesmo que o pacote @vercel/functions faz); fora dela, o processo continua rodando.
 */
function inBackground(task: Promise<unknown>) {
  const holder = (globalThis as unknown as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[
    Symbol.for("@vercel/request-context")
  ];
  const safe = task.catch((e) => console.error("[whatsapp]", e));
  holder?.get?.()?.waitUntil?.(safe);
}

/** recebe o webhook da Evolution: grava as mensagens agora; a resposta vem em segundo plano */
export async function handleEvolutionWebhook(body: unknown) {
  const cfg = evolutionConfig();
  if (!cfg) return;
  const settings = await getWhatsAppSettings();
  if (!settings.enabled) return;
  for (const m of parseEvolutionWebhook(body)) {
    if (m.fromMe) {
      await ownerMessage(m);
      continue;
    }
    const pending = await leadMessage(settings, m);
    if (pending) inBackground(answerAfterPause(cfg, settings, pending.contactId, pending.conversationId, pending.messageId));
  }
}

/** o dono escreveu pelo celular: entra no histórico e a IA pausa neste contato */
async function ownerMessage(m: IncomingMessage) {
  const contact = await prisma.whatsAppContact.findUnique({ where: { jid: m.jid } });
  if (!contact || (await isOurEcho(contact.conversationId, m))) return;
  await addConversationMessage(contact.conversationId, "bot", "text", { text: incomingText(m), waId: m.waId, manual: true }, WA_NODE);
  await prisma.whatsAppContact.update({ where: { id: contact.id }, data: { pausedUntil: new Date(Date.now() + OWNER_PAUSE_MS) } });
}

/** grava a mensagem do lead; devolve o que responder (ou null: repetida, pausada, sem cérebro) */
async function leadMessage(settings: WhatsAppSettings, m: IncomingMessage) {
  const known = await prisma.whatsAppContact.findUnique({ where: { jid: m.jid }, select: { conversationId: true } });
  if (await alreadyHave(known?.conversationId ?? null, m.waId)) return null; // a Evolution reenviou o mesmo webhook
  const contact = await contactFor(m);
  const saved = await addConversationMessage(contact.conversationId, "user", "text", { text: incomingText(m), waId: m.waId }, WA_NODE);
  await prisma.whatsAppContact.update({ where: { id: contact.id }, data: { lastInboundAt: new Date() } });
  await prisma.lead.update({ where: { id: contact.leadId }, data: { lastInteractionAt: new Date() } }).catch(() => undefined);
  await trackEvent({ leadId: contact.leadId, conversationId: contact.conversationId, type: "ai_message", nodeId: WA_NODE, data: { value: incomingText(m), channel: "whatsapp" } });

  if (settings.pausedAll || !settings.brainId || contact.paused || (contact.pausedUntil && contact.pausedUntil > new Date())) return null;
  return { contactId: contact.id, conversationId: contact.conversationId, messageId: saved.id };
}

/** espera o lead terminar de digitar: se chegou outra mensagem dele, a resposta fica com ela */
async function answerAfterPause(cfg: EvolutionConfig, settings: WhatsAppSettings, contactId: string, conversationId: string, messageId: string) {
  await sleep(GATHER_MS);
  const last = await prisma.message.findFirst({ where: { conversationId, sender: "user" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (last && last.id !== messageId) return;
  await replyWithBrain(cfg, settings, contactId);
}

/** o Cérebro responde o contato (textos, prévias, áudios e oferta com PIX) */
export async function replyWithBrain(cfg: EvolutionConfig, settings: WhatsAppSettings, contactId: string) {
  const contact = await prisma.whatsAppContact.findUnique({ where: { id: contactId } });
  const brain = settings.brainId ? await prisma.brain.findUnique({ where: { id: settings.brainId } }) : null;
  if (!contact || !brain || !brain.active) return;
  const es = settings.language !== "pt-BR";

  // limite de respostas por dia por contato (o "máximo de respostas" do cérebro)
  const today = await prisma.event.count({
    where: { conversationId: contact.conversationId, type: "ai_reply", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
  });
  if (today >= brain.maxReplies) return;

  // pagamento pendente: confere no gateway antes (se já caiu, a IA sabe que ele comprou)
  const pending = await prisma.payment.findMany({ where: { leadId: contact.leadId, status: { in: ["PENDING", "CREATED"] }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } });
  for (const p of pending) await syncPaymentWithProvider(p).catch(() => undefined);

  const [history, lead, paid] = await Promise.all([
    prisma.message.findMany({ where: { conversationId: contact.conversationId }, orderBy: { createdAt: "asc" }, take: 200 }),
    prisma.lead.findUnique({ where: { id: contact.leadId }, select: { name: true } }),
    prisma.payment.findMany({ where: { leadId: contact.leadId, status: "APPROVED" }, include: { product: { select: { name: true } } } }),
  ]);
  const context = [
    lead?.name ? `Nome (do WhatsApp): ${lead.name}` : "",
    "Canal: WhatsApp. Não existem botões, cards nem tela de chamada: a oferta chega como mensagem com o preço e o PIX (copia e cola).",
    paid.length ? `Já comprou: ${paid.map((p) => p.product.name).join(", ")} (não ofereça de novo o que já comprou; agradeça e siga o objetivo)` : "Ainda não comprou nada.",
  ]
    .filter(Boolean)
    .join("\n");

  let reply;
  try {
    reply = await runBrain({ brain, history: toTurns(history.slice(-60)), context, language: settings.language, boughtProductIds: paid.map((p) => p.productId) });
  } catch (e) {
    console.error("[whatsapp] IA falhou", e);
    if (brain.fallbackMessage?.trim()) reply = { messages: [brain.fallbackMessage.trim()], offer: null, audio: null, image: null, end: false };
    else return;
  }

  const send = async (text: string, extra: Record<string, unknown> = {}) => {
    const waId = await sendText(cfg, contact.jid, text, typingDelay(text));
    await addConversationMessage(contact.conversationId, "bot", "text", { text, ...(waId ? { waId } : {}), ...extra }, WA_NODE);
  };

  try {
    // a primeira resposta de cada contato avisa que é atendimento automatizado
    if (!contact.noticeSent) {
      await send(settings.notice, { notice: true });
      await prisma.whatsAppContact.update({ where: { id: contact.id }, data: { noticeSent: true } });
    }
    for (const text of reply.messages) await send(text);

    if (reply.image?.kind === "vip" && reply.image.groupId) {
      const card = await vipPreviewCard(reply.image.groupId);
      if (card) {
        const link = publicUrl(await vipAccessUrl({ id: card.groupId, slug: card.slug }, contact.leadId));
        const caption = `♛ ${card.name}\n${link}`;
        const pic = card.avatarUrl || card.coverUrl;
        const waId = pic ? await sendMedia(cfg, contact.jid, "image", publicUrl(pic), caption) : await sendText(cfg, contact.jid, caption);
        await addConversationMessage(contact.conversationId, "bot", "vip_preview", { ...card, aiImageId: reply.image.id, ...(waId ? { waId } : {}) } as Prisma.InputJsonValue, WA_NODE);
      }
    } else if (reply.image?.url) {
      const kind = reply.image.kind === "video" ? "video" : "image";
      const waId = await sendMedia(cfg, contact.jid, kind, publicUrl(reply.image.url));
      await addConversationMessage(contact.conversationId, "bot", kind, { url: reply.image.url, caption: "", aiImageId: reply.image.id, ...(waId ? { waId } : {}) }, WA_NODE);
    }
    // áudio (e a "ligação de voz", que no WhatsApp vai como mensagem de voz)
    for (const a of [reply.audio, reply.voiceCall].filter((x): x is { id: string; url: string } => !!x?.url)) {
      const waId = await sendAudio(cfg, contact.jid, publicUrl(a.url));
      await addConversationMessage(contact.conversationId, "bot", "audio", { url: a.url, caption: "", aiAudioId: a.id, ...(waId ? { waId } : {}) }, WA_NODE);
    }

    if (reply.offer) {
      const o = reply.offer;
      const p = o.product;
      const price = formatMoney(p.price, p.currency ?? "BRL", es ? (p.currency === "ARS" ? "es-AR" : "es-MX") : "pt-BR");
      await addConversationMessage(
        contact.conversationId,
        "bot",
        "offer",
        {
          productId: p.id,
          name: p.name,
          headline: o.headline || p.name,
          price: p.price,
          originalPrice: p.originalPrice,
          currency: p.currency,
          aiOfferId: o.id,
          ...publicOfferFormat(o),
        } as unknown as Prisma.InputJsonValue,
        WA_NODE,
      );
      await trackEvent({ leadId: contact.leadId, conversationId: contact.conversationId, type: "offer_viewed", nodeId: WA_NODE, data: { productId: p.id, ai: true, channel: "whatsapp" } });
      let payment: Payment | null = null;
      try {
        payment = await chargeProduct({ leadId: contact.leadId, conversationId: contact.conversationId, funnelId: null }, p, { method: "PIX", offerNodeId: WA_NODE, returnPath: "/" });
      } catch (e) {
        console.error("[whatsapp] cobrança falhou", e);
      }
      for (const text of paymentMessages(o.headline || p.name, price, payment, es)) await send(text);
    }
  } catch (e) {
    console.error("[whatsapp] envio falhou", e);
  }
  await trackEvent({ leadId: contact.leadId, conversationId: contact.conversationId, type: "ai_reply", nodeId: WA_NODE, data: { channel: "whatsapp", offer: reply.offer?.id ?? null } });
}

/** como pagar, em mensagens separadas (o código fica sozinho para copiar fácil) */
export function paymentMessages(name: string, price: string, payment: Pick<Payment, "pixQrCode" | "redirectUrl" | "nextAction"> | null, es: boolean): string[] {
  if (!payment) return [es ? "El pago no está disponible ahora 😕 intenta de nuevo en unos minutos" : "O pagamento está indisponível agora 😕 tenta de novo daqui a pouquinho"];
  const head = `🔥 ${name} — ${price}`;
  if (payment.pixQrCode)
    return [`${head}\n${es ? "Copia el código de abajo y paga en tu banco 👇 en cuanto se confirme te lo libero" : "Copia o código abaixo e paga no app do seu banco (Pix copia e cola) 👇 assim que cair eu te libero na hora"}`, payment.pixQrCode];
  const next = publicNextAction(payment.nextAction);
  if (next?.type === "bank_transfer" && Object.keys(next.details ?? {}).length) {
    const lines = Object.entries(next.details ?? {}).map(([k, v]) => `${k}: ${v}`);
    return [`${head}\n${es ? "Haz la transferencia con estos datos 👇" : "Faça a transferência com estes dados 👇"}`, lines.join("\n")];
  }
  const url = next?.url || payment.redirectUrl;
  if (url) return [`${head}\n${es ? "Paga por aquí 👇" : "Paga por aqui 👇"}`, url];
  if (next?.code) return [head, next.code];
  return [es ? "El pago no está disponible ahora 😕 intenta de nuevo en unos minutos" : "O pagamento está indisponível agora 😕 tenta de novo daqui a pouquinho"];
}

/** pagamento aprovado de um contato do WhatsApp: avisa e entrega (link do produto ou o vídeo da oferta) */
export async function onWhatsAppPaymentApproved(payment: Payment) {
  if (!payment.conversationId) return;
  const contact = await prisma.whatsAppContact.findFirst({ where: { conversationId: payment.conversationId } });
  const cfg = evolutionConfig();
  if (!contact || !cfg) return;
  const settings = await getWhatsAppSettings();
  const es = settings.language !== "pt-BR";
  const product = await prisma.product.findUnique({ where: { id: payment.productId } });
  const say = async (text: string) => {
    const waId = await sendText(cfg, contact.jid, text, typingDelay(text));
    await addConversationMessage(contact.conversationId, "bot", "text", { text, ...(waId ? { waId } : {}) }, WA_NODE);
  };
  await say(es ? "Pago confirmado ✅" : "Pagamento confirmado ✅");
  // entrega: o link do produto (Grupo VIP já entra liberado) ou o vídeo da oferta do cérebro
  const link = product?.deliveryUrl ? await withVipAccess(product.deliveryUrl, contact.leadId) : null;
  if (link) {
    await say(`${es ? "Aquí está tu acceso 👇" : "Aqui está seu acesso 👇"}\n${publicUrl(link)}`);
    return;
  }
  const brain = settings.brainId ? await prisma.brain.findUnique({ where: { id: settings.brainId } }) : null;
  const offer = brain ? brainOffers(brain).find((o) => (o.productId === payment.productId || o.downsellProductId === payment.productId) && o.videoId) : undefined;
  const video = offer?.videoId ? await prisma.video.findUnique({ where: { id: offer.videoId } }) : null;
  if (video) await say(`${es ? "Aquí está tu video 🔥" : "Aqui está seu vídeo 🔥"}\n${publicUrl(video.url)}`);
}
