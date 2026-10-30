// Pixels de anúncios no chat público: Meta, TikTok e Google (GA4).
// Os IDs são validados no servidor (só números/letras), então podem entrar no script com segurança.
import type { TrackingIds } from "@/types/flow";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
/** fila do pixel do TikTok (array com os métodos, como no snippet oficial) */
type Ttq = unknown[] & {
  methods: string[];
  setAndDefer: (obj: Ttq, m: string) => void;
  instance: (id: string) => Ttq;
  load: (id: string, opts?: Record<string, unknown>) => void;
  page: () => void;
  track: (e: string, p?: Record<string, unknown>, o?: Record<string, unknown>) => void;
  _i: Record<string, Ttq>;
  _u?: string;
  _t: Record<string, number>;
  _o: Record<string, Record<string, unknown>>;
  [m: string]: unknown;
};
type W = Window & {
  fbq?: Fbq;
  _fbq?: Fbq;
  ttq?: Ttq;
  TiktokAnalyticsObject?: string;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

let active: TrackingIds = {};

function addScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** Carrega os pixels configurados e registra o PageView. offerPixels: pixels da Meta próprios de ofertas do fluxo. */
export function initPixels(ids: TrackingIds | undefined, offerPixels: string[] = []) {
  if (typeof window === "undefined" || (!ids && !offerPixels.length)) return;
  const w = window as W;
  active = ids ?? {};
  const metaIds = [...new Set([...flowMetaPixels(), ...offerPixels].filter((v) => /^\d{5,25}$/.test(v)))];

  if (metaIds.length && !w.fbq) {
    const n = function (...args: unknown[]) {
      n.callMethod ? n.callMethod(...args) : n.queue!.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    w.fbq = n;
    w._fbq = n;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
    for (const id of metaIds) w.fbq("init", id);
    w.fbq("track", "PageView"); // vai para todos os pixels iniciados
  }
  if (!ids) return;

  if (ids.tiktokPixelId && !w.ttq) {
    // snippet oficial do TikTok (fila "ttq" com _i/_u/_t/_o, que o events.js lê ao carregar)
    const t = "ttq";
    w.TiktokAnalyticsObject = t;
    const ttq = (w.ttq = (w.ttq || []) as unknown as Ttq);
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    ttq.setAndDefer = (obj, m) => {
      obj[m] = (...args: unknown[]) => obj.push([m, ...args]);
    };
    for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
    ttq.instance = (id) => {
      const e = ttq._i[id] || ([] as unknown as Ttq);
      for (const m of ttq.methods) ttq.setAndDefer(e, m);
      return e;
    };
    ttq.load = (id, opts) => {
      const r = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {};
      ttq._i[id] = [] as unknown as Ttq;
      ttq._i[id]._u = r;
      ttq._t = ttq._t || {};
      ttq._t[id] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[id] = opts || {};
      const sc = document.createElement("script");
      sc.type = "text/javascript";
      sc.async = true;
      sc.src = `${r}?sdkid=${id}&lib=${t}`;
      const first = document.getElementsByTagName("script")[0];
      if (first?.parentNode) first.parentNode.insertBefore(sc, first);
      else document.head.appendChild(sc);
    };
    ttq.load(ids.tiktokPixelId);
    ttq.page();
  }

  if (ids.googleTagId && !w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    addScript(`https://www.googletagmanager.com/gtag/js?id=${ids.googleTagId}`);
    w.gtag("js", new Date());
    w.gtag("config", ids.googleTagId); // envia page_view
  }
}

interface PixelProduct {
  value: number; // reais
  name: string;
  id: string;
  /** id do evento — o mesmo é usado na API de Conversões para não contar duas vezes */
  eventId: string;
  /** pixel da Meta próprio da oferta (recebe junto com os pixels do fluxo) */
  metaPixelId?: string | null;
  /** BRL ou MXN */
  currency?: string | null;
}

/** pixels da Meta do fluxo (todas as contas de anúncio) */
function flowMetaPixels(): string[] {
  return [...new Set([...(active.metaPixelIds ?? []), active.metaPixelId].filter((v): v is string => !!v))];
}

/**
 * Evento da Meta para cada pixel do fluxo e para o pixel da oferta (se tiver). trackSingle: os pixels de outras
 * ofertas, iniciados para o PageView, não recebem. O mesmo eventID em todos: cada pixel deduplica com a API de Conversões.
 */
function metaTrack(w: W, event: string, data: Record<string, unknown>, p: PixelProduct) {
  for (const target of new Set([...flowMetaPixels(), ...(p.metaPixelId ? [p.metaPixelId] : [])])) {
    w.fbq?.("trackSingle", target, event, data, { eventID: p.eventId });
  }
}

export function pixelInitiateCheckout(p: PixelProduct) {
  if (typeof window === "undefined") return;
  const w = window as W;
  const data = { value: p.value, currency: p.currency || "BRL", content_name: p.name, content_ids: [p.id], content_type: "product", num_items: 1 };
  metaTrack(w, "InitiateCheckout", data, p);
  if (active.tiktokPixelId) w.ttq?.track("InitiateCheckout", { value: p.value, currency: p.currency || "BRL", content_id: p.id, content_name: p.name }, { event_id: p.eventId });
  if (active.googleTagId) w.gtag?.("event", "begin_checkout", { value: p.value, currency: p.currency || "BRL", items: [{ item_id: p.id, item_name: p.name }] });
}

export function pixelPurchase(p: PixelProduct) {
  if (typeof window === "undefined") return;
  const w = window as W;
  const data = { value: p.value, currency: p.currency || "BRL", content_name: p.name, content_ids: [p.id], content_type: "product", num_items: 1 };
  metaTrack(w, "Purchase", data, p);
  if (active.tiktokPixelId) w.ttq?.track("CompletePayment", { value: p.value, currency: p.currency || "BRL", content_id: p.id, content_name: p.name }, { event_id: p.eventId });
  if (active.googleTagId) w.gtag?.("event", "purchase", { transaction_id: p.eventId, value: p.value, currency: p.currency || "BRL", items: [{ item_id: p.id, item_name: p.name }] });
}

/** Cookies do pixel da Meta, enviados ao servidor para a API de Conversões. */
export function metaCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};
  const get = (k: string) => document.cookie.split("; ").find((c) => c.startsWith(`${k}=`))?.slice(k.length + 1);
  return { fbp: get("_fbp"), fbc: get("_fbc") };
}
