// Pixels de anúncios no chat público: Meta, TikTok e Google (GA4).
// Os IDs são validados no servidor (só números/letras), então podem entrar no script com segurança.
import type { TrackingIds } from "@/types/flow";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
type W = Window & {
  fbq?: Fbq;
  _fbq?: Fbq;
  ttq?: { load: (id: string) => void; page: () => void; track: (e: string, p?: Record<string, unknown>, o?: Record<string, unknown>) => void } & Record<string, unknown>;
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

/** Carrega os pixels configurados e registra o PageView. */
export function initPixels(ids: TrackingIds | undefined) {
  if (typeof window === "undefined" || !ids) return;
  const w = window as W;
  active = ids;

  if (ids.metaPixelId && !w.fbq) {
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
    w.fbq("init", ids.metaPixelId);
    w.fbq("track", "PageView");
  }

  if (ids.tiktokPixelId && !w.ttq) {
    const methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    const queue: unknown[] = [];
    const ttq = { _q: queue } as unknown as NonNullable<W["ttq"]>;
    for (const m of methods) (ttq as Record<string, unknown>)[m] = (...a: unknown[]) => queue.push([m, ...a]);
    ttq.load = (id: string) => {
      (ttq as Record<string, unknown>)._i = { [id]: [] };
      addScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`);
    };
    w.TiktokAnalyticsObject = "ttq";
    w.ttq = ttq;
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
}

export function pixelInitiateCheckout(p: PixelProduct) {
  if (typeof window === "undefined") return;
  const w = window as W;
  const data = { value: p.value, currency: "BRL", content_name: p.name, content_ids: [p.id], content_type: "product", num_items: 1 };
  if (active.metaPixelId) w.fbq?.("track", "InitiateCheckout", data, { eventID: p.eventId });
  if (active.tiktokPixelId) w.ttq?.track("InitiateCheckout", { value: p.value, currency: "BRL", content_id: p.id, content_name: p.name }, { event_id: p.eventId });
  if (active.googleTagId) w.gtag?.("event", "begin_checkout", { value: p.value, currency: "BRL", items: [{ item_id: p.id, item_name: p.name }] });
}

export function pixelPurchase(p: PixelProduct) {
  if (typeof window === "undefined") return;
  const w = window as W;
  const data = { value: p.value, currency: "BRL", content_name: p.name, content_ids: [p.id], content_type: "product", num_items: 1 };
  if (active.metaPixelId) w.fbq?.("track", "Purchase", data, { eventID: p.eventId });
  if (active.tiktokPixelId) w.ttq?.track("CompletePayment", { value: p.value, currency: "BRL", content_id: p.id, content_name: p.name }, { event_id: p.eventId });
  if (active.googleTagId) w.gtag?.("event", "purchase", { transaction_id: p.eventId, value: p.value, currency: "BRL", items: [{ item_id: p.id, item_name: p.name }] });
}

/** Cookies do pixel da Meta, enviados ao servidor para a API de Conversões. */
export function metaCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};
  const get = (k: string) => document.cookie.split("; ").find((c) => c.startsWith(`${k}=`))?.slice(k.length + 1);
  return { fbp: get("_fbp"), fbc: get("_fbc") };
}
