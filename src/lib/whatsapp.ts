// Upsell "WhatsApp pessoal": o número fica no servidor e só vira link depois do pagamento aprovado.
import type { UpsellMarker } from "@/types/video";

/** só os dígitos do número (DDI + DDD + número); null se não parece um número de celular */
export function whatsappDigits(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/**
 * número sem o DDI do país (ex.: 11 98765-4321): o wa.me lê os primeiros dígitos como DDI e abre outro número.
 * Com DDI são 12+ dígitos (Brasil 55, México 52, Argentina 54); 11 dígitos só valem nos EUA/Canadá (1 + DDD 2–9).
 */
export function missingDdi(phone: string | null | undefined): boolean {
  const d = whatsappDigits(phone);
  return !!d && d.length < 12 && !/^1[2-9]\d{9}$/.test(d);
}

/** DDI do país da moeda do produto (para números salvos sem ele) */
const DDI: Record<string, string> = { BRL: "55", MXN: "52", ARS: "549" };

/** link que abre a conversa no número, já com a mensagem escrita (sem DDI: o do país da moeda) */
export function whatsappLink(phone: string | null | undefined, message?: string | null, currency?: string | null): string | null {
  let d = whatsappDigits(phone);
  if (!d) return null;
  if (missingDdi(d)) d = (DDI[currency ?? "BRL"] ?? "55") + d;
  const text = message?.trim();
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** link do upsell que vende este produto com número de WhatsApp ("WhatsApp pessoal" ou oferta com o número; o primeiro válido) */
export function whatsappLinkForProduct(
  markers: Pick<UpsellMarker, "style" | "productId" | "basicProductId" | "whatsapp" | "vip">[],
  productId: string,
  currency?: string | null,
): string | null {
  for (const m of markers) {
    if (!markerSendsWhatsapp(m) || (m.productId !== productId && m.basicProductId !== productId)) continue;
    const link = whatsappLink(m.whatsapp?.phone, m.whatsapp?.message, currency);
    if (link) return link;
  }
  return null;
}

/** link do WhatsApp do combo do Cérebro que vende este produto (o primeiro com número válido) */
export function whatsappLinkForOffer(
  offers: { style?: string; productId: string; whatsapp?: { phone?: string; message?: string } }[],
  productId: string,
  currency?: string | null,
): string | null {
  for (const o of offers) {
    if (o.style !== "combo" || o.productId !== productId) continue;
    const link = whatsappLink(o.whatsapp?.phone, o.whatsapp?.message, currency);
    if (link) return link;
  }
  return null;
}

/** o que vai para o navegador antes de pagar: o upsell sem o número (oferta com número: só o aviso de que há o botão) */
export function publicMarker<M extends Pick<UpsellMarker, "whatsapp" | "style" | "vip">>(m: M): Omit<M, "whatsapp"> & { whatsappAfter?: true } {
  const { whatsapp, ...rest } = m;
  return { ...rest, ...(markerSendsWhatsapp(m) ? { whatsappAfter: true as const } : {}) };
}

/** o upsell entrega o WhatsApp depois do pagamento: "WhatsApp pessoal", ou oferta no tema WhatsApp com o número */
export function markerSendsWhatsapp(m: Pick<UpsellMarker, "whatsapp" | "style" | "vip">): boolean {
  return !!whatsappDigits(m.whatsapp?.phone) && (m.style === "whatsapp" || m.vip?.theme === "whatsapp");
}
