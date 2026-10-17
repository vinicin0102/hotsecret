// Grupo VIP: perfil da modelo com posts (fotos/vídeos). Post grátis todos veem; "Só VIP" libera com a assinatura;
// "Pago à parte" libera com o produto do próprio post. A mídia de um post bloqueado NUNCA sai do servidor antes
// do pagamento aprovado — o navegador recebe só a prévia borrada.
import type { NextApiRequest } from "next";
import type { Product, VipGroup, VipPost } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError, getClientIp } from "@/lib/api";
import { ADMIN_COOKIE, signVipToken, verifyAdminSession, verifyVipToken, type VipSession } from "@/lib/auth";
import { asCurrency, currencyOfLocale } from "@/lib/format";
import { parseUserAgent } from "@/lib/device";
import { sanitizeUrl } from "@/lib/sanitize";
import { trackEvent } from "./tracking";
import { providerNameForCurrency } from "./payments/index";
import { zenithDefaultPayer } from "./payments/zenith";
import { chargeProduct, publicPayment, syncPaymentWithProvider } from "./payments/service";
import type { ZenithPayerInput } from "./payments/zenith-checkout";

export const VIP_ACCESS = ["free", "vip", "paid"] as const;
export type VipAccess = (typeof VIP_ACCESS)[number];
export const VIP_LOCALES = ["pt-BR", "es-MX", "es-AR"] as const;
export type VipLocale = (typeof VIP_LOCALES)[number];

export interface VipMedia {
  url: string;
  kind: "image" | "video";
  /** prévia borrada (o que aparece enquanto está bloqueado) */
  preview?: string;
}
export interface VipSettings {
  /** frase em destaque no card da assinatura */
  headline?: string;
  /** o que a assinatura inclui (um item por linha) */
  perks?: string[];
  /** texto do botão de assinar */
  ctaLabel?: string;
}

type GroupWithPosts = VipGroup & { posts: VipPost[] };

export function vipMedia(raw: unknown): VipMedia[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && typeof (m as { url?: unknown }).url === "string")
    .map((m) => ({
      url: String(m.url),
      kind: m.kind === "video" ? ("video" as const) : ("image" as const),
      ...(typeof m.preview === "string" && m.preview ? { preview: m.preview } : {}),
    }));
}

export function vipSettings(raw: unknown): VipSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ...(typeof s.headline === "string" && s.headline.trim() ? { headline: s.headline.trim() } : {}),
    ...(Array.isArray(s.perks) ? { perks: s.perks.filter((p): p is string => typeof p === "string" && !!p.trim()).map((p) => p.trim()) } : {}),
    ...(typeof s.ctaLabel === "string" && s.ctaLabel.trim() ? { ctaLabel: s.ctaLabel.trim() } : {}),
  };
}

export const vipLocale = (v: unknown): VipLocale => (v === "es-MX" || v === "es-AR" ? v : "pt-BR");

/** link de entrega que aponta para este grupo: produto vendido no chat que dá acesso ao VIP */
export function deliveryPointsToGroup(url: string | null | undefined, slug: string): boolean {
  if (!url || !slug) return false;
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/g/${esc}(?:[/?#]|$)`).test(url);
}

/** acesso efetivo do post: "Pago à parte" sem produto vale como "Só VIP" */
export function postAccess(p: Pick<VipPost, "access" | "productId">): VipAccess {
  if (p.access === "free") return "free";
  if (p.access === "paid" && p.productId) return "paid";
  return "vip";
}

/** o post está liberado para quem tem estas compras? */
export function postUnlocked(p: Pick<VipPost, "access" | "productId">, subscribed: boolean, owned: Set<string>): boolean {
  const a = postAccess(p);
  if (a === "free") return true;
  if (a === "vip") return subscribed;
  return owned.has(p.productId!);
}

function publicVipProduct(p: Product) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    price: p.price,
    originalPrice: p.originalPrice,
    currency: p.currency,
    // pesos sem pagador padrão: o comprador informa os dados que o gateway pede antes de gerar
    ...(providerNameForCurrency(asCurrency(p.currency)) === "zenith" && !zenithDefaultPayer() ? { payerForm: true } : {}),
  };
}
export type PublicVipProduct = ReturnType<typeof publicVipProduct>;

/** produtos que se vendem neste grupo: a assinatura e os posts pagos à parte, ativos e na moeda do país do grupo */
export async function sellableProducts(group: GroupWithPosts): Promise<Map<string, Product>> {
  const ids = [...new Set([group.productId, ...group.posts.filter((p) => postAccess(p) === "paid").map((p) => p.productId)].filter((v): v is string => !!v))];
  if (!ids.length) return new Map();
  const currency = currencyOfLocale(group.locale);
  const list = await prisma.product.findMany({ where: { id: { in: ids }, active: true } });
  return new Map(list.filter((p) => asCurrency(p.currency) === currency).map((p) => [p.id, p]));
}

/** o dono logado no painel vê o grupo em rascunho (pré-visualização) */
export const adminPreview = async (req: NextApiRequest) => !!(await verifyAdminSession(req.cookies[ADMIN_COOKIE]));

/**
 * Link de entrega de um produto do chat que aponta para um Grupo VIP: leva junto o acesso do mesmo lead
 * (as compras feitas no chat valem no grupo). Outros links voltam como estão.
 */
export async function withVipAccess(url: string | null, leadId: string): Promise<string | null> {
  const slug = url ? /\/g\/([a-z0-9-]{2,60})(?:[/?#]|$)/.exec(url)?.[1] : undefined;
  if (!url || !slug) return url;
  const group = await prisma.vipGroup.findUnique({ where: { slug }, select: { id: true } });
  if (!group) return url;
  const token = await signVipToken({ leadId, groupId: group.id });
  const [base, hash = ""] = url.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}acesso=${encodeURIComponent(token)}${hash ? `#${hash}` : ""}`;
}

export async function findGroup(slug: string, allowDraft = false): Promise<GroupWithPosts> {
  const group = await prisma.vipGroup.findUnique({
    where: { slug },
    include: { posts: { orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }] } },
  });
  if (!group || (!group.published && !allowDraft)) throw new HttpError(404, "Grupo não encontrado");
  return group;
}

/** compras aprovadas do lead: produtos e se alguma dá acesso ao VIP pelo link de entrega */
async function entitlements(group: VipGroup, leadId: string | null) {
  if (!leadId) return { owned: new Set<string>(), subscribed: false };
  const approved = await prisma.payment.findMany({
    where: { leadId, status: "APPROVED" },
    select: { productId: true, product: { select: { deliveryUrl: true } } },
  });
  const owned = new Set(approved.map((p) => p.productId));
  const subscribed = (!!group.productId && owned.has(group.productId)) || approved.some((p) => deliveryPointsToGroup(p.product.deliveryUrl, group.slug));
  return { owned, subscribed };
}

/** página do grupo para este visitante: perfil, posts (bloqueados só com a prévia) e os pagamentos dele em andamento */
export async function vipState(group: GroupWithPosts, leadId: string | null) {
  const [products, { owned, subscribed }] = await Promise.all([sellableProducts(group), entitlements(group, leadId)]);
  const character = group.characterId ? await prisma.character.findUnique({ where: { id: group.characterId } }) : null;

  // pagamentos recentes deste lead nos produtos do grupo (o PIX gerado continua na tela; pendente: confere no gateway)
  const recent = leadId
    ? await prisma.payment.findMany({
        where: { leadId, productId: { in: [...products.keys()] }, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];
  const payments = await Promise.all(recent.map((p) => (p.status === "PENDING" || p.status === "CREATED" ? syncPaymentWithProvider(p) : p)));
  // se o gateway acabou de aprovar, recalcula o acesso
  const fresh = payments.some((p, i) => p.status === "APPROVED" && recent[i].status !== "APPROVED") ? await entitlements(group, leadId) : { owned, subscribed };

  const all = group.posts.flatMap((p) => vipMedia(p.media));
  const sub = group.productId ? products.get(group.productId) : undefined;
  return {
    group: {
      name: group.name || character?.name || "VIP",
      /** nome da modelo (a chave PIX aparece "de" quem) */
      model: character?.name || group.name || "VIP",
      slug: group.slug,
      bio: group.bio,
      avatarUrl: group.avatarUrl || character?.avatarUrl || null,
      coverUrl: group.coverUrl,
      locale: vipLocale(group.locale),
      published: group.published,
      settings: vipSettings(group.settings),
      product: sub ? publicVipProduct(sub) : null,
      counts: { posts: group.posts.length, images: all.filter((m) => m.kind === "image").length, videos: all.filter((m) => m.kind === "video").length },
    },
    subscribed: fresh.subscribed,
    posts: group.posts.map((p) => {
      const media = vipMedia(p.media);
      const access = postAccess(p);
      const product = access === "paid" ? products.get(p.productId!) : undefined;
      // post pago com produto inválido (inativo/outra moeda) fica bloqueado e sem botão de compra
      const unlocked = postUnlocked(p, fresh.subscribed, fresh.owned);
      return {
        id: p.id,
        caption: p.caption,
        publishedAt: p.publishedAt.toISOString(),
        pinned: p.pinned,
        access,
        locked: !unlocked,
        product: product ? publicVipProduct(product) : null,
        counts: { images: media.filter((m) => m.kind === "image").length, videos: media.filter((m) => m.kind === "video").length },
        media: unlocked ? media.map((m) => ({ kind: m.kind, url: m.url, preview: m.preview ?? null })) : media.map((m) => ({ kind: m.kind, url: null, preview: m.preview ?? null })),
      };
    }),
    payments: payments.map(publicPayment),
  };
}
export type VipState = Awaited<ReturnType<typeof vipState>>;

const tu = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);

/**
 * Sessão do visitante: retoma o token do grupo; "acesso" = token que o chat entrega junto com o link do grupo
 * (o comprador entra já como o mesmo lead e as compras do chat valem aqui); senão cria um lead novo.
 */
export async function vipSession(
  req: NextApiRequest,
  group: VipGroup,
  input: { token?: string | null; acesso?: string | null; utm?: Record<string, unknown>; referrer?: string | null; landingPage?: string | null },
): Promise<{ token: string; leadId: string }> {
  for (const t of [input.token, input.acesso]) {
    const s = await verifyVipToken(t);
    if (s && s.groupId === group.id && (await prisma.lead.findUnique({ where: { id: s.leadId }, select: { id: true } }))) {
      return { token: t === input.token ? t! : await signVipToken(s), leadId: s.leadId };
    }
  }
  const ua = parseUserAgent(req.headers["user-agent"]);
  const country = (req.headers["x-vercel-ip-country"] as string) || (req.headers["cf-ipcountry"] as string) || null;
  const utm = input.utm ?? {};
  const lead = await prisma.lead.create({
    data: {
      utmSource: tu(utm.utm_source),
      utmMedium: tu(utm.utm_medium),
      utmCampaign: tu(utm.utm_campaign),
      utmContent: tu(utm.utm_content),
      utmTerm: tu(utm.utm_term),
      referrer: sanitizeUrl(input.referrer) || null,
      landingPage: sanitizeUrl(input.landingPage) || null,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      country: country ? country.slice(0, 8) : null,
      clientIp: getClientIp(req).slice(0, 64),
      userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
      variables: { _grupoVip: group.slug },
    },
  });
  await trackEvent({ leadId: lead.id, type: "page_view", data: { vipGroup: group.id } });
  return { token: await signVipToken({ leadId: lead.id, groupId: group.id }), leadId: lead.id };
}

export async function requireVipSession(token: unknown, group: VipGroup): Promise<VipSession> {
  const s = await verifyVipToken(token);
  if (!s || s.groupId !== group.id) throw new HttpError(401, "Sessão expirada. Recarregue a página.");
  return s;
}

/** gera o pagamento de um produto do grupo (assinatura ou post pago à parte) */
export async function vipCheckout(group: GroupWithPosts, session: VipSession, productId: string, payer?: ZenithPayerInput) {
  const product = (await sellableProducts(group)).get(productId);
  if (!product) throw new HttpError(400, vipLocale(group.locale) === "pt-BR" ? "Produto indisponível" : "Producto no disponible");
  await trackEvent({ leadId: session.leadId, type: "checkout_started", data: { vipGroup: group.id, productId } });
  const payment = await chargeProduct({ leadId: session.leadId, conversationId: null, funnelId: null }, product, {
    method: "PIX",
    payer,
    offerNodeId: null,
    returnPath: `/g/${group.slug}`,
  });
  return publicPayment(payment);
}
