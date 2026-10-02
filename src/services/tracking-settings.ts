// Pixels: configuração padrão (Configurações) + sobrescrita por fluxo.
import { prisma } from "@/lib/prisma";
import type { TrackingIds } from "@/types/flow";

export interface GlobalTracking extends TrackingIds {
  /** token da API de Conversões da Meta — SEGREDO, nunca vai ao navegador */
  metaCapiToken?: string;
  /** código de teste do Gerenciador de Eventos (opcional) */
  metaTestEventCode?: string;
}

const KEY = "tracking";

export async function getGlobalTracking(): Promise<GlobalTracking> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return (row?.value as GlobalTracking | undefined) ?? {};
}

export async function saveGlobalTracking(value: GlobalTracking) {
  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: clean }, update: { value: clean } });
}

/** IDs efetivos de um fluxo: os do fluxo, senão os padrão. */
export function mergeTracking(global: TrackingIds, funnel?: TrackingIds): TrackingIds {
  return {
    metaPixelId: funnel?.metaPixelId || global.metaPixelId || undefined,
    tiktokPixelId: funnel?.tiktokPixelId || global.tiktokPixelId || undefined,
    googleTagId: funnel?.googleTagId || global.googleTagId || undefined,
  };
}

/** Só os IDs públicos (sem tokens) — o que pode ir para a página do chat. */
export function publicTracking(ids: TrackingIds): TrackingIds {
  const out: TrackingIds = {};
  if (ids.metaPixelId) out.metaPixelId = ids.metaPixelId;
  if (ids.tiktokPixelId) out.tiktokPixelId = ids.tiktokPixelId;
  if (ids.googleTagId) out.googleTagId = ids.googleTagId;
  return out;
}
