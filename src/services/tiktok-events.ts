// API de Eventos do TikTok: os eventos do funil saem também pelo servidor (não dependem do navegador nem de
// bloqueador de anúncio): ViewContent (viu a oferta), InitiateCheckout (gerou o pagamento) e CompletePayment (o
// gateway confirmou). O navegador manda InitiateCheckout e CompletePayment com o mesmo event_id — o TikTok conta uma vez.
import { createHash } from "node:crypto";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/memo";
import { absoluteUrl } from "@/lib/paths";
import { openSecret } from "@/lib/secret-box";
import type { FunnelSettings } from "@/types/flow";
import { getGlobalTracking, getGlobalTrackingCached, mergeTracking } from "./tracking-settings";

const EVENTS_URL = (process.env.TIKTOK_EVENTS_URL || "https://business-api.tiktok.com/open_api/v1.3/event/track/").replace(/\/?$/, "/");
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** DDI do país do lead para telefones salvos sem ele */
const DDI_BY_COUNTRY: Record<string, string> = { BR: "55", MX: "52", AR: "54" };

type LeadLike = {
  id: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
};

/** dados do lead para o TikTok achar a pessoa: e-mail e telefone (E.164) e id do lead com hash; clique e cookie do pixel */
export function tiktokUserOf(lead: LeadLike): Record<string, string> {
  const u: Record<string, string> = { external_id: sha256(lead.id) };
  const email = lead.email?.trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) u.email = sha256(email);
  let phone = (lead.phone ?? "").replace(/\D/g, "");
  const ddi = lead.country ? DDI_BY_COUNTRY[lead.country.toUpperCase()] : undefined;
  if (phone.length >= 10 && phone.length <= 11 && ddi) phone = ddi + phone;
  if (phone.length >= 12 && phone.length <= 15) u.phone = sha256(`+${phone}`);
  if (lead.clientIp && lead.clientIp !== "unknown") u.ip = lead.clientIp;
  if (lead.userAgent) u.user_agent = lead.userAgent;
  if (lead.ttclid) u.ttclid = lead.ttclid;
  if (lead.ttp) u.ttp = lead.ttp;
  return u;
}

export type TiktokEventName = "ViewContent" | "InitiateCheckout" | "CompletePayment";

interface TiktokProduct {
  id: string;
  name: string;
  /** centavos */
  price: number;
  currency?: string | null;
}

/** um evento no formato da API de Eventos (v1.3) */
export function tiktokEvent(input: { name: TiktokEventName; eventId: string; lead: LeadLike; product?: TiktokProduct | null; url?: string; at?: Date }) {
  const p = input.product;
  return {
    event: input.name,
    event_time: Math.floor((input.at ?? new Date()).getTime() / 1000),
    event_id: input.eventId,
    user: tiktokUserOf(input.lead),
    ...(input.url ? { page: { url: input.url } } : {}),
    properties: p
      ? {
          currency: p.currency || "BRL",
          value: p.price / 100,
          content_type: "product",
          contents: [{ content_id: p.id, content_name: p.name, price: p.price / 100, quantity: 1 }],
        }
      : {},
  };
}

/** token (aberto só aqui no servidor), pixel efetivo do fluxo e código de teste; null = API de Eventos desligada */
async function target(funnelId: string | null | undefined) {
  const global = await getGlobalTrackingCached();
  const token = global.tiktokTokenSealed ? openSecret(global.tiktokTokenSealed) : null;
  if (!token) return null;
  const funnel = funnelId
    ? await cached(`tt:funnel:${funnelId}`, 20_000, () => prisma.funnel.findUnique({ where: { id: funnelId }, select: { slug: true, settings: true } }))
    : null;
  const pixel = mergeTracking(global, (funnel?.settings as FunnelSettings | null)?.tracking).tiktokPixelId;
  if (!pixel) return null;
  return { token, pixel, testCode: global.tiktokTestEventCode || undefined, url: funnel ? absoluteUrl(`/f/${funnel.slug}`) : undefined };
}

/** POST para o TikTok; a mensagem de erro dele vai para o log (nunca o token) */
async function post(t: { token: string; pixel: string; testCode?: string }, data: unknown[]): Promise<boolean> {
  return (await postWithResult(t, data)).ok;
}

async function postWithResult(t: { token: string; pixel: string; testCode?: string }, data: unknown[]): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(EVENTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Access-Token": t.token },
    body: JSON.stringify({ event_source: "web", event_source_id: t.pixel, ...(t.testCode ? { test_event_code: t.testCode } : {}), data }),
    signal: AbortSignal.timeout(15000),
  });
  const r = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
  if (!res.ok || (typeof r.code === "number" && r.code !== 0)) {
    console.error("[tiktok-events] eventos recusados", t.pixel, res.status, JSON.stringify(r).slice(0, 400));
    return { ok: false, error: r.message?.slice(0, 300) || `HTTP ${res.status}` };
  }
  return { ok: true };
}

/**
 * Botão "Enviar eventos de teste" (Configurações): ViewContent, InitiateCheckout e CompletePayment de R$ 1,00 com o
 * código de teste — aparecem só em "Testar eventos" no TikTok, não contam nas campanhas. Exige o código de teste.
 */
export async function sendTiktokTestEvents(who: { ip?: string; userAgent?: string }): Promise<{ sent: number; error?: string }> {
  const global = await getGlobalTracking();
  const token = global.tiktokTokenSealed ? openSecret(global.tiktokTokenSealed) : null;
  if (!global.tiktokPixelId) return { sent: 0, error: "Cadastre o ID do pixel do TikTok e salve." };
  if (!token) return { sent: 0, error: "Cadastre o token da API de Eventos do TikTok e salve." };
  if (!global.tiktokTestEventCode) return { sent: 0, error: "Preencha o código de teste do TikTok e salve (os eventos de teste só vão com ele)." };
  const stamp = Date.now().toString(36);
  const lead = { id: `teste_${stamp}`, clientIp: who.ip, userAgent: who.userAgent };
  const product = { id: "produto_teste", name: "Teste HOT SECRET", price: 100, currency: "BRL" };
  const data = (["ViewContent", "InitiateCheckout", "CompletePayment"] as const).map((name) =>
    tiktokEvent({ name, eventId: `teste_${name}_${stamp}`, lead, product, url: absoluteUrl("/") }),
  );
  const r = await postWithResult({ token, pixel: global.tiktokPixelId, testCode: global.tiktokTestEventCode }, data);
  return r.ok ? { sent: data.length } : { sent: 0, error: r.error };
}

/** ViewContent / InitiateCheckout do funil (segundo plano, nunca atrasa o chat) */
export async function sendTiktokFunnelEvent(ev: { name: "ViewContent" | "InitiateCheckout"; eventId: string; leadId: string; funnelId?: string | null; productId: string }) {
  const t = await target(ev.funnelId);
  if (!t) return;
  const [lead, product] = await Promise.all([
    prisma.lead.findUnique({ where: { id: ev.leadId } }),
    cached(`tt:product:${ev.productId}`, 20_000, () => prisma.product.findUnique({ where: { id: ev.productId }, select: { id: true, name: true, price: true, currency: true } })),
  ]);
  if (!lead) return;
  await post(t, [tiktokEvent({ name: ev.name, eventId: ev.eventId, lead, product, url: t.url })]);
}

/** venda aprovada (event_id = id do pagamento, o mesmo do pixel do navegador); teste (sandbox) só com o código de teste */
export async function sendTiktokPurchase(payment: Payment) {
  const t = await target(payment.funnelId);
  if (!t) return;
  if ((payment.provider === "sandbox" || payment.provider === "preview") && !t.testCode) return;
  const [lead, product] = await Promise.all([
    prisma.lead.findUnique({ where: { id: payment.leadId } }),
    prisma.product.findUnique({ where: { id: payment.productId }, select: { id: true, name: true } }),
  ]);
  if (!lead) return;
  const sold = { id: payment.productId, name: product?.name ?? "Produto", price: payment.amount, currency: payment.currency };
  await post(t, [tiktokEvent({ name: "CompletePayment", eventId: payment.id, lead, product: sold, url: t.url, at: payment.approvedAt ?? undefined })]);
}
