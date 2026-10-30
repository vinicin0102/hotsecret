// Histórico da conversa em texto para a IA — o mesmo no chat do site e no WhatsApp.
import { CALL_ENDED_NOTE, type ChatTurn } from "./brain";
import { formatBRL, formatMoney } from "@/lib/format";

/** preço do histórico na moeda certa (a IA nunca deve ver R$ numa oferta em pesos) */
const priceForAi = (cents: number, currency: unknown) =>
  currency === "MXN" ? `${formatMoney(cents, "MXN", "es-MX")} MXN` : currency === "ARS" ? `${formatMoney(cents, "ARS", "es-AR")} ARS` : formatBRL(cents);

export type Msg = { sender: string; type: string; content: unknown };

/** Histórico da conversa em texto para a IA (inclui o roteiro do fluxo antes do Cérebro). */
export function toTurns(messages: Msg[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const c = (m.content ?? {}) as Record<string, unknown>;
    const text = typeof c.text === "string" ? c.text : "";
    switch (m.type) {
      case "text":
        if (text) turns.push({ role: m.sender === "user" ? "lead" : "bot", text });
        break;
      case "buttons":
        turns.push({ role: "bot", text: `${text}${Array.isArray(c.buttons) && c.buttons.length ? ` [opções: ${(c.buttons as string[]).join(" / ")}]` : ""}` });
        break;
      case "image":
      case "video":
        if (m.sender === "user") {
          // foto enviada pelo lead: a IA vê a imagem (as mais recentes)
          if (m.type === "image" && typeof c.url === "string") turns.push({ role: "lead", text: "[enviou uma foto]", imageUrl: c.url });
          break;
        }
        turns.push({
          role: "bot",
          text: `[enviou ${m.type === "image" ? "uma foto" : "um vídeo"}${c.caption ? `: ${String(c.caption)}` : ""}${c.aiImageId ? ` (image_id "${String(c.aiImageId)}")` : ""}]`,
        });
        break;
      case "vip_preview":
        turns.push({ role: "bot", text: `[mandou a prévia do Grupo VIP "${String(c.name ?? "")}" (${Number((c.counts as { images?: number })?.images) || 0} fotos e ${Number((c.counts as { videos?: number })?.videos) || 0} vídeos)${c.aiImageId ? ` (image_id "${String(c.aiImageId)}")` : ""}]` });
        break;
      case "audio":
        turns.push({ role: "bot", text: `[enviou um áudio${c.aiAudioId ? ` (audio_id "${String(c.aiAudioId)}")` : ""}]` });
        break;
      case "offer":
        turns.push({
          role: "bot",
          text: `[${c.style === "call" ? "ligou para o lead (chamada de vídeo) com a oferta" : c.style === "tarot" ? "mostrou as cartas de tarot viradas da oferta" : c.style === "live" ? (c.vipButton ? `mostrou o botão "${String(c.ctaLabel || "FAZER LIGAÇÃO PRIVADA")}" (o lead toca para ver a oferta) da oferta` : "abriu o upgrade do canal VIP ao vivo com a oferta") : "mostrou o card da oferta"} ${String(c.headline || c.name || "")} — ${typeof c.price === "number" ? priceForAi(c.price, c.currency) : ""}${c.aiOfferId ? ` (offer_id "${String(c.aiOfferId)}")` : ""}]`,
        });
        break;
      case "checkout":
        turns.push({ role: "lead", text: "[tocou no botão para comprar e gerou o pagamento]" });
        break;
      case "call_declined":
        turns.push({ role: "lead", text: "[recusou a chamada de vídeo]" });
        break;
      case "call_ended":
        turns.push({ role: "lead", text: CALL_ENDED_NOTE });
        break;
      case "voice_call":
        if (c.status === "ringing") turns.push({ role: "bot", text: "[ligou para o lead (ligação de voz)]" });
        else if (c.status === "declined") turns.push({ role: "lead", text: "[recusou a ligação de voz]" });
        else if (c.status === "ended") turns.push({ role: "lead", text: `[atendeu a ligação de voz e ouviu ${Number(c.seconds) || 0}s da sua fala]` });
        break;
      case "payment_update":
        if (text) turns.push({ role: "bot", text: `[sistema: ${text}]` });
        break;
      default:
        break;
    }
  }
  return turns;
}
