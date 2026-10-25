// Vitrine: carrossel de modelos — cada card leva ao fluxo (chat) da modelo, no estilo de chat escolhido.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getGlobalTracking, publicTracking } from "./tracking-settings";

export const SHOWCASE_LOCALES = ["pt-BR", "es-MX", "es-AR"] as const;
export type ShowcaseLocale = (typeof SHOWCASE_LOCALES)[number];
/** estilo do chat ao abrir pela vitrine: default = chat Secret · messenger = estilo WhatsApp · ausente = o do fluxo */
export const SHOWCASE_CHATS = ["default", "messenger"] as const;
export type ShowcaseChat = (typeof SHOWCASE_CHATS)[number];

export interface ShowcaseItem {
  id: string;
  funnelId: string;
  name?: string;
  photoUrl?: string;
  /** linha curta embaixo do nome (o que ela faz) */
  headline?: string;
  bio?: string;
  /** destaques em chips (ex.: 📸 Fotos exclusivas) */
  tags?: string[];
  chat?: ShowcaseChat;
}

const url = z.string().trim().max(2000).refine((v) => !v || /^(https:\/\/|\/)/.test(v), "Link da foto inválido (use https:// ou envie o arquivo)");
const txt = (max: number) => z.string().trim().max(max).optional().nullable();

export const showcaseSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à vitrine").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Link muito curto")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen no link"),
  title: txt(120),
  subtitle: txt(240),
  locale: z.enum(SHOWCASE_LOCALES).default("pt-BR"),
  published: z.boolean().default(false),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        funnelId: z.string().trim().min(1, "Escolha o fluxo de cada modelo").max(64),
        name: txt(60),
        photoUrl: url.optional().nullable(),
        headline: txt(120),
        bio: txt(600),
        tags: z.array(z.string().trim().max(40)).max(6).optional(),
        chat: z.enum(SHOWCASE_CHATS).optional().nullable(),
      }),
    )
    .max(30, "No máximo 30 modelos por vitrine"),
});
export type ShowcaseInput = z.infer<typeof showcaseSchema>;

export function showcaseData(d: ShowcaseInput) {
  const items: ShowcaseItem[] = d.items.map((i) => ({
    id: i.id,
    funnelId: i.funnelId,
    ...(i.name ? { name: i.name } : {}),
    ...(i.photoUrl ? { photoUrl: i.photoUrl } : {}),
    ...(i.headline ? { headline: i.headline } : {}),
    ...(i.bio ? { bio: i.bio } : {}),
    ...(i.tags?.filter(Boolean).length ? { tags: i.tags.filter(Boolean) } : {}),
    ...(i.chat ? { chat: i.chat } : {}),
  }));
  return {
    name: d.name,
    slug: d.slug,
    title: d.title || null,
    subtitle: d.subtitle || null,
    locale: d.locale,
    published: d.published,
    items: items as unknown as Prisma.InputJsonValue,
  };
}

export function showcaseItems(raw: unknown): ShowcaseItem[] {
  return (Array.isArray(raw) ? raw : []).filter(
    (i): i is ShowcaseItem => !!i && typeof i === "object" && typeof (i as ShowcaseItem).id === "string" && typeof (i as ShowcaseItem).funnelId === "string",
  );
}

/** link do chat da modelo: o fluxo + o estilo do chat escolhido na vitrine */
export function showcaseChatHref(funnelSlug: string, chat?: ShowcaseChat | null): string {
  const q = chat === "messenger" ? "?chat=whatsapp" : chat === "default" ? "?chat=secret" : "";
  return `/f/${funnelSlug}${q}`;
}

export interface PublicShowcaseCard {
  id: string;
  name: string;
  photoUrl: string | null;
  headline: string | null;
  bio: string | null;
  tags: string[];
  online: boolean;
  href: string;
}

/** vitrine para o lead: só os cards de fluxos publicados (na ordem do painel) */
export async function publicShowcase(slug: string, allowDraft = false) {
  const s = await prisma.showcase.findUnique({ where: { slug } });
  if (!s || (!s.published && !allowDraft)) return null;
  const items = showcaseItems(s.items);
  const funnels = await prisma.funnel.findMany({
    where: { id: { in: items.map((i) => i.funnelId) }, ...(allowDraft ? {} : { status: "PUBLISHED" as const }) },
    include: { character: true },
  });
  const byId = new Map(funnels.map((f) => [f.id, f]));
  const cards: PublicShowcaseCard[] = items.flatMap((i) => {
    const f = byId.get(i.funnelId);
    if (!f) return [];
    const c = f.character;
    return [
      {
        id: i.id,
        name: i.name || c?.name || f.name,
        photoUrl: i.photoUrl || c?.avatarUrl || null,
        headline: i.headline || null,
        bio: i.bio || c?.description || null,
        tags: i.tags ?? [],
        online: (c?.showOnline ?? true) && (c?.status ?? "online") === "online",
        href: showcaseChatHref(f.slug, i.chat),
      },
    ];
  });
  return {
    name: s.name,
    slug: s.slug,
    title: s.title,
    subtitle: s.subtitle,
    locale: s.locale as ShowcaseLocale,
    published: s.published,
    cards,
    tracking: publicTracking(await getGlobalTracking()),
  };
}
export type PublicShowcase = NonNullable<Awaited<ReturnType<typeof publicShowcase>>>;
