// Grupo VIP no painel: validação do que o dono salva (grupo e posts).
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { VIP_ACCESS, VIP_LOCALES } from "./vip";

const url = z.string().trim().max(2000).refine((v) => !v || /^(https:\/\/|\/)/.test(v), "Link inválido (use https:// ou envie o arquivo)");
const txt = (max: number) => z.string().trim().max(max).optional().nullable();

export const vipGroupSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao grupo").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Link muito curto")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen no link"),
  characterId: txt(64),
  bio: txt(1500),
  avatarUrl: url.optional().nullable(),
  coverUrl: url.optional().nullable(),
  productId: txt(64),
  locale: z.enum(VIP_LOCALES).default("pt-BR"),
  published: z.boolean().default(false),
  settings: z
    .object({
      headline: txt(160),
      perks: z.array(z.string().trim().max(120)).max(8).optional(),
      ctaLabel: txt(40),
      anyPurchase: z.boolean().optional(),
    })
    .default({}),
});
export type VipGroupInput = z.infer<typeof vipGroupSchema>;

export function vipGroupData(d: VipGroupInput) {
  return {
    name: d.name,
    slug: d.slug,
    characterId: d.characterId || null,
    bio: d.bio || null,
    avatarUrl: d.avatarUrl || null,
    coverUrl: d.coverUrl || null,
    productId: d.productId || null,
    locale: d.locale,
    published: d.published,
    settings: {
      ...(d.settings.headline ? { headline: d.settings.headline } : {}),
      ...(d.settings.perks?.filter(Boolean).length ? { perks: d.settings.perks.filter(Boolean) } : {}),
      ...(d.settings.ctaLabel ? { ctaLabel: d.settings.ctaLabel } : {}),
      anyPurchase: d.settings.anyPurchase !== false,
    } as Prisma.InputJsonValue,
  };
}

export const vipPostSchema = z
  .object({
    caption: txt(2000),
    media: z
      .array(z.object({ url: url.refine((v) => !!v, "Arquivo sem link"), kind: z.enum(["image", "video"]), preview: url.optional().nullable() }))
      .max(20, "No máximo 20 arquivos por post"),
    access: z.enum(VIP_ACCESS).default("vip"),
    productId: txt(64),
    pinned: z.boolean().default(false),
    publishedAt: z.string().datetime().optional().nullable(),
  })
  .refine((p) => p.media.length > 0 || !!p.caption, "O post precisa de uma foto, vídeo ou texto")
  .refine((p) => p.access !== "paid" || !!p.productId, "Escolha o produto que libera este post");
export type VipPostInput = z.infer<typeof vipPostSchema>;

export function vipPostData(d: VipPostInput) {
  return {
    caption: d.caption || null,
    media: d.media.map((m) => ({ url: m.url, kind: m.kind, ...(m.preview ? { preview: m.preview } : {}) })) as Prisma.InputJsonValue,
    access: d.access,
    productId: d.access === "paid" ? d.productId || null : null,
    pinned: d.pinned,
    ...(d.publishedAt ? { publishedAt: new Date(d.publishedAt) } : {}),
  };
}
