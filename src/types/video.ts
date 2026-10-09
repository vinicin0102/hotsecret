// Linha do tempo do vídeo da chamada (tempos em milissegundos).

export interface TimeRange {
  start: number;
  end: number;
}

/** Fala no chat durante o vídeo (trilha CHAT). */
export interface ChatCue extends TimeRange {
  id: string;
  text: string;
}

/**
 * Upsell em tela cheia (3 passos): aviso por cima do vídeo → card "bloqueado" com o preço → folha do pagamento.
 * Cada upsell tem o seu tema (textos e ícones); vazios usam o texto padrão. {nome} = nome do personagem.
 */
export interface UpsellScreen {
  /** 1) aviso */
  icon?: string;
  title?: string;
  tag?: string;
  text?: string;
  button?: string;
  /** 2) card bloqueado */
  lockIcon?: string;
  lockBadge?: string;
  lockTitle?: string;
  lockText?: string;
  feeLabel?: string;
  feeNote?: string;
  payButton?: string;
  footNote?: string;
  /** 3) folha do pagamento */
  payIcon?: string;
  payTitle?: string;
}

/** Upsell que aparece num momento exato do trecho VIP. */
export interface UpsellMarker {
  id: string;
  at: number;
  label: string;
  productId: string;
  text?: string;
  ctaLabel?: string;
  /** pausa o vídeo até o lead comprar ou recusar */
  pause?: boolean;
  /** card: caixa de oferta embaixo (padrão) · screen: tela cheia em 3 passos */
  style?: "card" | "screen";
  screen?: UpsellScreen;
}

export interface VideoTimeline {
  /** antes de pagar: este trecho fica em loop */
  free: TimeRange;
  /** depois de pagar: este trecho toca (e fica em loop no fim) */
  vip: TimeRange;
  chat: ChatCue[];
  markers: UpsellMarker[];
}

export function defaultTimeline(durationMs: number): VideoTimeline {
  const d = Math.max(0, Math.round(durationMs));
  const cut = Math.round(d / 3);
  return { free: { start: 0, end: cut }, vip: { start: Math.min(d, cut + 1), end: d }, chat: [], markers: [] };
}

/** Garante tempos válidos dentro da duração. */
export function normalizeTimeline(raw: unknown, durationMs: number): VideoTimeline {
  const base = defaultTimeline(durationMs);
  const t = (raw ?? {}) as Partial<VideoTimeline>;
  const d = durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
  const clamp = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(d, Math.round(v))) : fb);
  const range = (r: Partial<TimeRange> | undefined, fb: TimeRange): TimeRange => {
    const start = clamp(r?.start, fb.start);
    const end = clamp(r?.end, fb.end);
    return end > start ? { start, end } : fb;
  };
  return {
    free: range(t.free, base.free),
    vip: range(t.vip, base.vip),
    chat: (Array.isArray(t.chat) ? t.chat : [])
      .map((c) => ({ ...c, ...range(c, { start: 0, end: 0 }) }))
      .filter((c) => c.end > c.start)
      .sort((a, b) => a.start - b.start),
    markers: (Array.isArray(t.markers) ? t.markers : []).map((m) => ({ ...m, at: clamp(m.at, 0) })).sort((a, b) => a.at - b.at),
  };
}

/** 7:19.647 */
export function formatMs(ms: number): string {
  const v = Math.max(0, Math.round(ms));
  const m = Math.floor(v / 60000);
  const s = Math.floor((v % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(v % 1000).padStart(3, "0")}`;
}
