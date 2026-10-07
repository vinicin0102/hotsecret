// Schemas de validação (zod) compartilhados pelas rotas de API.
import { z } from "zod";
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from "@/types/flow";
import { sanitizeText, sanitizeUrl } from "./sanitize";

const txt = (max = 2000) => z.string().max(max * 2).transform((v) => sanitizeText(v, max));
const optTxt = (max = 2000) => txt(max).optional();
const url = z.string().max(2048).transform((v) => sanitizeUrl(v));
const optUrl = url.optional();
const id = z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/);

const button = z.object({ id, label: txt(80), keywords: optTxt(300) });
const inputMode = z.enum(["type", "both", "click"]).optional();
const tarotCards = z
  .array(z.object({ id, label: optTxt(40), name: optTxt(80), imageUrl: optUrl, meaning: optTxt(3000) }))
  .max(7);

const delaySettings = z.object({
  delayMode: z.enum(["inherit", "fixed", "random", "auto"]).optional(),
  delayMs: z.number().int().min(0).max(60000).optional(),
  delayMinMs: z.number().int().min(0).max(60000).optional(),
  delayMaxMs: z.number().int().min(0).max(60000).optional(),
  showTyping: z.boolean().optional(),
  minimized: z.boolean().optional(),
  label: optTxt(60),
});

const contentSchemas: Record<NodeType, z.ZodType> = {
  start: z.object({}).passthrough().transform(() => ({})),
  text: z.object({ text: txt(4000), sender: z.enum(["bot", "user"]).optional() }),
  image: z.object({ url, caption: optTxt(500) }),
  video: z.object({ url, thumbnailUrl: optUrl, caption: optTxt(500), autoplay: z.boolean().optional(), viewOnce: z.boolean().optional() }),
  audio: z.object({ url, durationSec: z.number().min(0).max(3600).optional(), caption: optTxt(500) }),
  question: z.object({
    text: txt(2000),
    mode: z.enum(["open", "buttons"]),
    variable: z.string().regex(/^[a-zA-Z0-9_]{0,40}$/).optional(),
    placeholder: optTxt(120),
    buttons: z.array(button).max(10).optional(),
    inputMode,
  }),
  buttons: z.object({ text: optTxt(2000), buttons: z.array(button).max(10), inputMode, placeholder: optTxt(120) }),
  offer: z.object({
    productId: z.string().max(64),
    headline: optTxt(120),
    description: optTxt(600),
    ctaLabel: optTxt(60),
    style: z.enum(["card", "call"]).optional(),
    videoId: z.string().max(64).optional(),
    downsellProductId: z.string().max(64).optional(),
    downsellText: optTxt(200),
  }),
  delivery: z.object({ text: optTxt(1000), productId: z.string().max(64).optional(), buttonLabel: optTxt(60) }),
  link: z.object({ text: optTxt(1000), url, buttonLabel: optTxt(60) }),
  tag: z.object({ tagId: z.string().max(64) }),
  end: z.object({ text: optTxt(1000) }),
  ai: z.object({
    brainId: z.string().max(64),
    goal: optTxt(2000),
    startMode: z.enum(["wait", "ai"]).optional(),
    placeholder: optTxt(120),
  }),
};

export const NODE_TYPES = Object.keys(contentSchemas) as NodeType[];

const rawNode = z.object({
  id,
  type: z.enum(NODE_TYPES as [NodeType, ...NodeType[]]),
  content: z.unknown(),
  settings: delaySettings.optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
});

const edgeSchema = z.object({
  id,
  source: id,
  target: id,
  condition: z
    .string()
    .regex(/^(default|btn:[a-zA-Z0-9_-]{1,64}|payment:(approved|failed)|ai:offers)$/)
    .default("default"),
});

export const graphSchema = z
  .object({ nodes: z.array(rawNode).max(500), edges: z.array(edgeSchema).max(1500) })
  .transform((g): FlowGraph => {
    const nodes: FlowNode[] = g.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      content: contentSchemas[n.type].parse(n.content ?? {}) as FlowNode["content"],
      settings: n.settings ?? {},
      position: n.position,
    }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges: FlowEdge[] = g.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  });

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v);
export const trackingIdsSchema = z.object({
  metaPixelId: z.preprocess(emptyToUndef, z.string().regex(/^\d{5,20}$/, "Pixel da Meta: só números").optional()),
  tiktokPixelId: z.preprocess(emptyToUndef, z.string().regex(/^[A-Z0-9]{10,32}$/i, "Pixel do TikTok inválido").optional()),
  googleTagId: z.preprocess(emptyToUndef, z.string().regex(/^(G|AW|GT)-[A-Z0-9]{4,20}$/i, "Use um ID como G-XXXXXXX").optional()),
});

export const recoverySchema = z.object({
  enabled: z.boolean(),
  delayMinutes: z.number().int().min(1).max(60 * 24 * 7),
  message: txt(1000),
  buttonLabel: txt(60),
});

export const funnelMetaSchema = z.object({
  name: txt(120).pipe(z.string().min(1, "Informe o nome")),
  description: optTxt(500).nullable(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens"),
  characterId: z.string().max(64).nullable().optional(),
  initialMessage: optTxt(1000).nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  settings: z
    .object({
      defaultDelayMs: z.number().int().min(0).max(60000).optional(),
      delay: z
        .object({
          mode: z.enum(["fixed", "random", "auto"]),
          ms: z.number().int().min(0).max(60000).optional(),
          minMs: z.number().int().min(0).max(60000).optional(),
          maxMs: z.number().int().min(0).max(60000).optional(),
        })
        .optional(),
      recovery: recoverySchema.optional(),
      tracking: trackingIdsSchema.optional(),
      appearance: z
        .object({
          bgVideoUrl: optUrl,
          bgDim: z.number().int().min(0).max(90).optional(),
          fadeOld: z.boolean().optional(),
          visibleCount: z.number().int().min(2).max(20).optional(),
        })
        .optional(),
    })
    .optional(),
});

export const characterSchema = z.object({
  name: txt(80).pipe(z.string().min(1, "Informe o nome")),
  avatarUrl: optUrl.nullable(),
  description: optTxt(300).nullable(),
  status: txt(40).default("online"),
  showOnline: z.boolean().default(true),
  initialMessages: z.array(txt(1000)).max(10).default([]),
});

export const productSchema = z.object({
  name: txt(120).pipe(z.string().min(1, "Informe o nome")),
  description: optTxt(1000).nullable(),
  imageUrl: optUrl.nullable(),
  videoUrl: optUrl.nullable(),
  originalPrice: z.number().int().min(0).max(100_000_00).nullable().optional(),
  price: z.number().int().min(100, "Preço mínimo R$ 1,00").max(100_000_00),
  checkoutUrl: optUrl.nullable(),
  deliveryUrl: optUrl.nullable(),
  active: z.boolean().default(true),
});

const brainOfferSchema = z.object({
  id,
  productId: z.string().min(1).max(64),
  when: optTxt(1000),
  pitch: optTxt(2000),
  headline: optTxt(120),
  ctaLabel: optTxt(60),
  style: z.enum(["card", "call", "tarot"]).optional(),
  videoId: z.string().max(64).optional(),
  downsellProductId: z.string().max(64).optional(),
  downsellText: optTxt(200),
  tarotCards: tarotCards.optional(),
  tarotBackUrl: optUrl,
});
const brainAudioSchema = z.object({ id, url: url.pipe(z.string().min(1, "Áudio sem arquivo")), when: optTxt(500) });

export const brainSchema = z.object({
  name: txt(80).pipe(z.string().min(1, "Informe o nome")),
  active: z.boolean().default(true),
  persona: txt(6000).default(""),
  knowledge: txt(60000).default(""),
  rules: txt(6000).default(""),
  mustRules: txt(6000).default(""),
  examples: txt(12000).default(""),
  offers: z.array(brainOfferSchema).max(20).default([]),
  audios: z.array(brainAudioSchema).max(40).default([]),
  images: z
    .array(z.object({ id, url: url.pipe(z.string().min(1, "Prévia sem arquivo")), when: optTxt(500), kind: z.enum(["image", "video"]).optional() }))
    .max(60)
    .default([]),
  maxReplies: z.number().int().min(1).max(200).default(30),
  fallbackMessage: txt(300).default(""),
});

const msRange = z.object({ start: z.number().int().min(0).max(36_000_000), end: z.number().int().min(0).max(36_000_000) });
export const videoSchema = z.object({
  name: txt(160).pipe(z.string().min(1, "Informe o nome")),
  url: url.pipe(z.string().min(1, "Envie o vídeo")),
  posterUrl: optUrl.nullable(),
  durationMs: z.number().int().min(0).max(36_000_000).default(0),
  timeline: z
    .object({
      free: msRange,
      vip: msRange,
      chat: z.array(msRange.extend({ id, text: txt(500) })).max(200),
      markers: z
        .array(
          z.object({
            id,
            at: z.number().int().min(0).max(36_000_000),
            label: txt(40),
            productId: z.string().max(64),
            text: optTxt(300),
            ctaLabel: optTxt(60),
            pause: z.boolean().optional(),
          }),
        )
        .max(50),
    })
    .optional(),
});

export const tagSchema = z.object({
  name: txt(40).pipe(z.string().min(1)).transform((v) => v.toUpperCase()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#D94F7D"),
});

export const automationSchema = z.object({
  name: txt(80).pipe(z.string().min(1)),
  trigger: z.string().regex(/^[a-z_]{3,40}$/),
  funnelId: z.string().max(64).nullable().optional(),
  action: z.enum(["add_tag", "remove_tag"]),
  tagId: z.string().max(64),
  active: z.boolean().default(true),
});

export const experimentSchema = z.object({
  name: txt(80).pipe(z.string().min(1)),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  active: z.boolean().default(true),
  variants: z
    .array(z.object({ funnelId: z.string().max(64), label: txt(40), weight: z.number().int().min(0).max(100) }))
    .min(2, "Adicione ao menos 2 variantes")
    .max(5),
});

export const checkoutSchema = z.object({
  token: z.string().min(10).max(2000),
  offerNodeId: id,
  /** ofertas do Cérebro: produto escolhido pela IA */
  productId: z.string().max(64).optional(),
  method: z.enum(["PIX", "CARD"]).default("PIX"),
  // cookies do pixel da Meta (para a API de Conversões)
  fbp: z.string().max(200).regex(/^fb\.\d\.\d+\.\d+$/).optional().catch(undefined),
  fbc: z.string().max(400).regex(/^fb\.\d\.\d+\.[\w-]+$/).optional().catch(undefined),
});
