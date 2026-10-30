// Pixels: configuração padrão (Configurações) + sobrescrita por fluxo.
// Meta: vários pixels (uma conta de anúncios cada); todos recebem os eventos, cada um com o seu token da API de Conversões.
import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secret-box";
import type { TrackingIds } from "@/types/flow";

/** pixel da Meta cadastrado nas Configurações; o token fica criptografado (nunca vai ao navegador) */
export interface StoredMetaPixel {
  id: string;
  tokenSealed?: string;
}

export interface GlobalTracking extends TrackingIds {
  /** legado: token (texto) do pixel único de antes da lista — SEGREDO, nunca vai ao navegador */
  metaCapiToken?: string;
  /** código de teste do Gerenciador de Eventos (opcional) */
  metaTestEventCode?: string;
  metaPixels?: StoredMetaPixel[];
}

const KEY = "tracking";

export async function getGlobalTracking(): Promise<GlobalTracking> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return (row?.value as GlobalTracking | undefined) ?? {};
}

export async function saveGlobalTracking(value: GlobalTracking) {
  const clean: Record<string, unknown> = Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
  if (value.metaPixels?.length) clean.metaPixels = value.metaPixels.map((p) => ({ id: p.id, ...(p.tokenSealed ? { tokenSealed: p.tokenSealed } : {}) }));
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: clean as object }, update: { value: clean as object } });
}

/** pixels da Meta padrão com o token aberto (só no servidor); antes da lista, o pixel único e o token dele */
export function globalMetaPixels(g: GlobalTracking): { id: string; token?: string }[] {
  if (g.metaPixels?.length) return g.metaPixels.map((p) => ({ id: p.id, token: (p.tokenSealed && openSecret(p.tokenSealed)) || undefined }));
  return g.metaPixelId ? [{ id: g.metaPixelId, token: g.metaCapiToken || undefined }] : [];
}

const uniq = (ids: (string | undefined | null)[]) => [...new Set(ids.filter((v): v is string => !!v))];

/** pixels da Meta próprios de um fluxo (a lista, ou o pixel único de antes dela) */
const funnelMetaIds = (f?: TrackingIds) => uniq(f?.metaPixelIds?.length ? f.metaPixelIds : [f?.metaPixelId]);

/**
 * IDs efetivos de um fluxo. Meta: sem pixels no fluxo, os padrão; com pixels no fluxo, os dele (mais os padrão se
 * "marcar também os padrão" estiver ligado — o pixel único de antes substituía). TikTok/Google: o do fluxo, senão o padrão.
 */
export function mergeTracking(global: GlobalTracking, funnel?: TrackingIds): TrackingIds {
  const own = funnelMetaIds(funnel);
  const defaults = global.metaPixels?.length ? global.metaPixels.map((p) => p.id) : uniq([global.metaPixelId]);
  const meta = own.length ? uniq([...(funnel?.metaWithDefault ? defaults : []), ...own]) : defaults;
  return {
    metaPixelIds: meta,
    metaPixelId: meta[0],
    tiktokPixelId: funnel?.tiktokPixelId || global.tiktokPixelId || undefined,
    googleTagId: funnel?.googleTagId || global.googleTagId || undefined,
  };
}

/** Só os IDs públicos (sem tokens) — o que pode ir para a página do chat. */
export function publicTracking(ids: TrackingIds): TrackingIds {
  const out: TrackingIds = {};
  const meta = uniq([...(ids.metaPixelIds ?? []), ids.metaPixelId]);
  if (meta.length) {
    out.metaPixelIds = meta;
    out.metaPixelId = meta[0];
  }
  if (ids.tiktokPixelId) out.tiktokPixelId = ids.tiktokPixelId;
  if (ids.googleTagId) out.googleTagId = ids.googleTagId;
  return out;
}
