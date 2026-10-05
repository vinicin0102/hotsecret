// Transporte do chat: "live" fala com a API (eventos persistidos), "preview" simula tudo em memória.
import { withBase } from "@/lib/paths";
import type { FlowNode } from "@/types/flow";
import { metaCookies } from "./pixels";
import type { ChatCue, TimeRange, UpsellMarker, VideoTimeline } from "@/types/video";
import { normalizeTimeline } from "@/types/video";

export interface ClientEvent {
  type: string;
  nodeId?: string | null;
  data?: Record<string, unknown>;
}

export interface PublicPaymentInfo {
  id: string;
  status: "CREATED" | "PENDING" | "APPROVED" | "FAILED" | "REFUNDED";
  method: "PIX" | "CARD";
  amount: number;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  redirectUrl: string | null;
  offerNodeId: string | null;
  productId: string;
  provider: string;
}

export interface ServerMessage {
  id: string;
  sender: "bot" | "user" | "system";
  type: string;
  content: Record<string, unknown>;
  nodeId: string | null;
  createdAt: string;
}

export interface CheckoutForm {
  method: "PIX" | "CARD";
  /** ofertas do Cérebro (IA): produto escolhido */
  productId?: string;
}

/** Vídeo da chamada (só é pedido quando o lead atende). */
export interface CallVideo {
  url: string;
  posterUrl: string | null;
  durationMs: number;
  free: TimeRange;
  vip: TimeRange;
  chat: ChatCue[];
  markers: (UpsellMarker & { product: { id: string; name: string; price: number; originalPrice: number | null } })[];
}

/** Resposta do Cérebro (IA). */
export interface AiReply {
  messages: string[];
  audio: { url: string } | null;
  image?: { url: string } | null;
  offer: {
    productId: string;
    headline?: string;
    description?: string;
    ctaLabel?: string;
    style?: "card" | "call";
    downsellProductId?: string;
    downsellText?: string;
  } | null;
  end: boolean;
  limit?: boolean;
}

export interface ChatTransport {
  mode: "live" | "preview";
  track(events: ClientEvent[]): void;
  flush(): Promise<void>;
  checkout(offerNodeId: string, form: CheckoutForm): Promise<PublicPaymentInfo>;
  poll(since: string | null): Promise<{ payments: PublicPaymentInfo[]; messages: ServerMessage[]; serverTime: string }>;
  delivery(productId?: string | null): Promise<{ url: string | null; productName: string }>;
  /** conteúdo pago liberado pelos pagamentos aprovados */
  unlock(): Promise<FlowNode[]>;
  /** link do vídeo de visualização única (null = já visualizado) */
  viewOnce(nodeId: string): Promise<string | null>;
  /** Cérebro: a IA responde (message null = a IA puxa a conversa) */
  ai(nodeId: string, message: string | null, event?: "call_declined"): Promise<AiReply>;
  /** chamada de vídeo: vídeo + linha do tempo da oferta (productId: oferta do Cérebro) */
  callVideo(nodeId: string, productId?: string): Promise<CallVideo | null>;
  simulatePayment?(paymentId: string, status: "APPROVED" | "FAILED"): Promise<PublicPaymentInfo | null>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(withBase(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Erro de conexão");
  return data as T;
}

export function createLiveTransport(getToken: () => string | null, opts: { sandbox: boolean }): ChatTransport {
  let chain: Promise<void> = Promise.resolve();
  return {
    mode: "live",
    track(events) {
      const token = getToken();
      if (!token || events.length === 0) return;
      // fila sequencial: mantém a ordem cronológica das mensagens no banco
      chain = chain
        .then(() => post("/api/public/events", { token, events }).then(() => undefined))
        .catch((e) => console.warn("[track]", e));
    },
    flush() {
      return chain;
    },
    async checkout(offerNodeId, form) {
      await chain;
      const r = await post<{ payment: PublicPaymentInfo }>("/api/public/checkout", { token: getToken(), offerNodeId, ...form, ...metaCookies() });
      return r.payment;
    },
    poll(since) {
      return post("/api/public/state", { token: getToken(), since: since ?? undefined });
    },
    delivery(productId) {
      return post("/api/public/delivery", { token: getToken(), productId });
    },
    async unlock() {
      const r = await post<{ nodes: FlowNode[] }>("/api/public/unlock", { token: getToken() });
      return r.nodes;
    },
    async callVideo(nodeId, productId) {
      const r = await post<{ video: CallVideo | null }>("/api/public/call", { token: getToken(), nodeId, productId });
      return r.video;
    },
    async ai(nodeId, message, event) {
      await chain;
      const body = event ? { token: getToken(), nodeId, event } : message === null ? { token: getToken(), nodeId, start: true } : { token: getToken(), nodeId, message };
      return post<AiReply>("/api/public/ai", body);
    },
    async viewOnce(nodeId) {
      try {
        const r = await post<{ url: string }>("/api/public/view-once", { token: getToken(), nodeId });
        return r.url;
      } catch (e) {
        if (e instanceof ApiError && e.status === 410) return null;
        throw e;
      }
    },
    simulatePayment: opts.sandbox
      ? async (paymentId, status) => {
          const r = await post<{ payment: PublicPaymentInfo | null }>("/api/public/sandbox-approve", {
            token: getToken(),
            paymentId,
            status,
          });
          return r.payment;
        }
      : undefined,
  };
}

/** Preview do construtor: nenhum dado é gravado; pagamentos são simulados localmente. */
export function createPreviewTransport(
  products: Record<string, { price: number }>,
  graphOfferProduct: (nodeId: string) => string | undefined,
  nodeUrl: (nodeId: string) => string | undefined = () => undefined,
  /** preview do Cérebro: cérebro e objetivo do bloco (conversa de teste pelo painel, nada é gravado) */
  aiNode: (nodeId: string) => { brainId?: string; goal?: string; videoId?: string } | undefined = () => undefined,
): ChatTransport {
  const opened = new Set<string>();
  const aiHistory = new Map<string, { role: "lead" | "bot"; text: string }[]>();
  const payments = new Map<string, PublicPaymentInfo>();
  let seq = 0;
  return {
    mode: "preview",
    track() {},
    async flush() {},
    async checkout(offerNodeId, form) {
      const productId = form.productId ?? graphOfferProduct(offerNodeId) ?? "";
      const p: PublicPaymentInfo = {
        id: `preview_${++seq}`,
        status: "PENDING",
        method: form.method,
        amount: products[productId]?.price ?? 0,
        pixQrCode: form.method === "PIX" ? "00020126PREVIEW-HOTSECRET-PIX-CODE5204000053039865802BR" : null,
        pixQrCodeBase64: null,
        redirectUrl: null,
        offerNodeId,
        productId,
        provider: "preview",
      };
      payments.set(p.id, p);
      return p;
    },
    async poll() {
      return { payments: [...payments.values()], messages: [], serverTime: new Date().toISOString() };
    },
    async delivery() {
      return { url: "#preview", productName: "Produto (preview)" };
    },
    async unlock() {
      return []; // o preview já recebe o fluxo completo
    },
    async callVideo(nodeId, productId) {
      // preview (admin): lê o vídeo e os produtos pelo painel
      const get = async <T,>(path: string) => {
        const res = await fetch(withBase(path));
        if (!res.ok) throw new ApiError(res.status, "Erro ao carregar o vídeo");
        return (await res.json()) as T;
      };
      const cfg = aiNode(nodeId);
      let videoId = cfg?.videoId;
      if (!videoId && cfg?.brainId) {
        const { brain } = await get<{ brain: { offers: { productId: string; style?: string; videoId?: string }[] } }>(`/api/admin/brains/${cfg.brainId}`);
        videoId = brain.offers.find((o) => (o.productId === productId || (o as { downsellProductId?: string }).downsellProductId === productId) && o.style === "call")?.videoId;
      }
      if (!videoId) return null;
      const [{ video }, { products: list }] = await Promise.all([
        get<{ video: { url: string; posterUrl: string | null; durationMs: number; timeline: VideoTimeline } }>(`/api/admin/videos/${videoId}`),
        get<{ products: { id: string; name: string; price: number; originalPrice: number | null; active: boolean }[] }>("/api/admin/products"),
      ]);
      const tl = normalizeTimeline(video.timeline, video.durationMs);
      const byId = new Map(list.filter((p) => p.active).map((p) => [p.id, p]));
      return {
        url: video.url,
        posterUrl: video.posterUrl,
        durationMs: video.durationMs,
        free: tl.free,
        vip: tl.vip,
        chat: tl.chat,
        markers: tl.markers
          .filter((m) => byId.has(m.productId))
          .map((m) => {
            const p = byId.get(m.productId)!;
            return { ...m, product: { id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice } };
          }),
      };
    },
    async ai(nodeId, message, event) {
      const cfg = aiNode(nodeId);
      const history = aiHistory.get(nodeId) ?? [];
      aiHistory.set(nodeId, history);
      if (event === "call_declined") history.push({ role: "lead", text: "[recusou a chamada de vídeo]" });
      else if (message !== null) history.push({ role: "lead", text: message });
      if (!cfg?.brainId) return { messages: ["(preview) Selecione um cérebro neste bloco."], audio: null, offer: null, end: false };
      try {
        const r = await post<{ messages: string[]; audio: { url: string } | null; image: { url: string } | null; offer: AiReply["offer"]; end: boolean }>(
          `/api/admin/brains/${cfg.brainId}/test`,
          { history, goal: cfg.goal },
        );
        for (const m of r.messages) history.push({ role: "bot", text: m });
        if (r.image) history.push({ role: "bot", text: "[enviou uma foto]" });
        if (r.audio) history.push({ role: "bot", text: "[enviou um áudio]" });
        if (r.offer) history.push({ role: "bot", text: `[${r.offer.style === "call" ? "ligou para o lead com a oferta" : "mostrou o card da oferta"} ${r.offer.headline ?? ""}]` });
        return { messages: r.messages, audio: r.audio ? { url: r.audio.url } : null, image: r.image ? { url: r.image.url } : null, offer: r.offer, end: r.end };
      } catch (e) {
        return { messages: [`(preview) ${e instanceof Error ? e.message : "Falha na IA"}`], audio: null, offer: null, end: false };
      }
    },
    async viewOnce(nodeId) {
      if (opened.has(nodeId)) return null;
      opened.add(nodeId);
      return nodeUrl(nodeId) ?? null;
    },
    async simulatePayment(paymentId, status) {
      const p = payments.get(paymentId);
      if (!p) return null;
      p.status = status;
      return { ...p };
    },
  };
}
