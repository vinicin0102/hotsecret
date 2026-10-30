// Upsell "WhatsApp pessoal": o número fica no servidor e só vira link depois do pagamento aprovado.
import type { UpsellMarker } from "@/types/video";

/** só os dígitos do número (DDI + DDD + número); null se não parece um número de celular */
export function whatsappDigits(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** link que abre a conversa no número, já com a mensagem escrita */
export function whatsappLink(phone: string | null | undefined, message?: string | null): string | null {
  const d = whatsappDigits(phone);
  if (!d) return null;
  const text = message?.trim();
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** link do upsell "WhatsApp pessoal" que vende este produto (o primeiro com número válido) */
export function whatsappLinkForProduct(markers: Pick<UpsellMarker, "style" | "productId" | "whatsapp">[], productId: string): string | null {
  for (const m of markers) {
    if (m.style !== "whatsapp" || m.productId !== productId) continue;
    const link = whatsappLink(m.whatsapp?.phone, m.whatsapp?.message);
    if (link) return link;
  }
  return null;
}

/** link do WhatsApp do combo do Cérebro que vende este produto (o primeiro com número válido) */
export function whatsappLinkForOffer(offers: { style?: string; productId: string; whatsapp?: { phone?: string; message?: string } }[], productId: string): string | null {
  for (const o of offers) {
    if (o.style !== "combo" || o.productId !== productId) continue;
    const link = whatsappLink(o.whatsapp?.phone, o.whatsapp?.message);
    if (link) return link;
  }
  return null;
}

/** o que vai para o navegador antes de pagar: o upsell sem o número */
export function publicMarker<M extends Pick<UpsellMarker, "whatsapp">>(m: M): Omit<M, "whatsapp"> {
  const { whatsapp: _hidden, ...rest } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}
