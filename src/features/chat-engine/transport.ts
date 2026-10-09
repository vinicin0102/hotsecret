// Transporte do chat: "live" fala com a API (eventos persistidos), "preview" simula tudo em memória.
import { withBase } from "@/lib/paths";
import type { FlowNode, LivePreview, TarotCard, VipOfferTexts } from "@/types/flow";
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
  /** BRL ou MXN */
  currency?: string;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  redirectUrl: string | null;
  offerNodeId: string | null;
  productId: string;
  provider: string;
  /** código do método no catálogo do gateway (ex.: spei) */
  methodCode?: string | null;
  /** instruções do gateway: CLABE/beneficiário e passos (transferência) */
  nextAction?: PaymentNextAction | null;
}

/** Próxima ação do comprador: redirect (url), qr_code/voucher (code), bank_transfer (details), app_approval (app). */
export interface PaymentNextAction {
  type: string;
  details?: Record<string, string>;
  instructions?: { title?: string; steps?: string[] };
  url?: string;
  code?: string;
  app?: Record<string, string>;
}

/** Campo pedido pelo catálogo do gateway (Zenith). */
export interface PayField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  autocomplete?: string;
  maxLength?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
}
export interface PayMethod {
  code: string;
  displayName: string;
  fields: PayField[];
}

/** Formas de pagamento do produto + nome/e-mail que o lead já informou. */
export interface PayMethods {
  methods: PayMethod[];
  prefill?: { name?: string; email?: string };
}

/** Dados do comprador para gateways que pedem (nunca dados de cartão). */
export interface PayerData {
  methodCode?: string;
  email: string;
  customer: Record<string, string>;
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
  /** dados do comprador (produtos com payerForm) */
  payer?: PayerData;
}

/** Vídeo da chamada (só é pedido quando o lead atende). */
export interface CallVideo {
  url: string;
  posterUrl: string | null;
  durationMs: number;
  free: TimeRange;
  vip: TimeRange;
  chat: ChatCue[];
  markers: (UpsellMarker & { product: { id: string; name: string; price: number; originalPrice: number | null; currency?: string } })[];
}

/** Resposta do Cérebro (IA). */
export interface AiReply {
  messages: string[];
  audio: { url: string } | null;
  image?: { url: string; kind?: "image" | "video" } | null;
  offer: {
    productId: string;
    headline?: string;
    description?: string;
    ctaLabel?: string;
    style?: "card" | "call" | "tarot" | "live";
    /** canal VIP AO VIVO: textos do upgrade/pagamento */
    vip?: VipOfferTexts;
    /** canal VIP AO VIVO: depois do pagamento abre a chamada de vídeo */
    hasVideo?: boolean;
    /** chamada de vídeo 02: ao atender, o FREE toca em loop */
    freeLoop?: boolean;
    tarotCards?: TarotCard[];
    tarotBackUrl?: string;
    downsellProductId?: string;
    downsellText?: string;
  } | null;
  end: boolean;
  /** soltar os botões de oferta (saída "Mostrar botões de oferta" do bloco) */
  showOffers?: boolean;
  /** ligação de voz: o lead autorizou — toca a ligação com este áudio */
  voiceCall?: { id: string; url: string } | null;
  limit?: boolean;
}

export interface ChatTransport {
  mode: "live" | "preview";
  track(events: ClientEvent[]): void;
  flush(): Promise<void>;
  checkout(offerNodeId: string, form: CheckoutForm): Promise<PublicPaymentInfo>;
  /** formas de pagamento do produto no catálogo do gateway (null = não pede dados) */
  paymentMethods(productId: string): Promise<PayMethods | null>;
  poll(since: string | null): Promise<{ payments: PublicPaymentInfo[]; messages: ServerMessage[]; serverTime: string }>;
  delivery(productId?: string | null): Promise<{ url: string | null; productName: string }>;
  /** conteúdo pago liberado pelos pagamentos aprovados */
  unlock(): Promise<FlowNode[]>;
  /** link do vídeo de visualização única (null = já visualizado) */
  viewOnce(nodeId: string): Promise<string | null>;
  /** Cérebro: a IA responde (message null = a IA puxa a conversa) */
  /** continue: o lead voltou para a IA (ex.: dúvida depois dos botões de oferta); message = o que ele respondeu */
  ai(nodeId: string, message: string | null, event?: "call_declined" | "photo" | "continue" | "voice_declined"): Promise<AiReply>;
  /** ligação de voz terminou (o lead atendeu): mensagem final + oferta */
  voiceCallEnded(nodeId: string, callId: string, seconds: number): Promise<{ endText: string | null; offer: AiReply["offer"] }>;
  /** foto do lead (já comprimida) → link da foto gravada na conversa */
  sendPhoto(nodeId: string, photo: Blob): Promise<string>;
  /** tarot: cartas reveladas (só depois do pagamento aprovado) */
  tarot(nodeId: string, productId?: string): Promise<TarotCard[] | null>;
  /** chamada de vídeo: vídeo + linha do tempo da oferta (productId: oferta do Cérebro) */
  callVideo(nodeId: string, productId?: string): Promise<CallVideo | null>;
  /** Canal VIP AO VIVO: libera a próxima prévia (null = acabaram) */
  livePreview(): Promise<ServerMessage | null>;
  simulatePayment?(paymentId: string, status: "APPROVED" | "FAILED"): Promise<PublicPaymentInfo | null>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** corpo da resposta de erro (ex.: fields com o erro de cada campo) */
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** idioma do chat público: a API devolve os erros para o lead nesse idioma */
let chatLocale = "pt-BR";

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withBase(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chat-locale": chatLocale },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, connectionError());
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? connectionError(), data as Record<string, unknown>);
  return data as T;
}

const connectionError = () => (chatLocale.startsWith("es") ? "Error de conexión. Inténtalo de nuevo." : "Erro de conexão");

export function createLiveTransport(getToken: () => string | null, opts: { sandbox: boolean; locale?: string }): ChatTransport {
  chatLocale = opts.locale ?? "pt-BR";
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
    async paymentMethods(productId) {
      const r = await post<{ methods: PayMethod[] | null; prefill?: PayMethods["prefill"] }>("/api/public/payment-methods", { token: getToken(), productId });
      return r.methods ? { methods: r.methods, prefill: r.prefill } : null;
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
    async voiceCallEnded(nodeId, callId, seconds) {
      await chain;
      return post("/api/public/voice-call", { token: getToken(), nodeId, callId, seconds });
    },
    async sendPhoto(nodeId, photo) {
      await chain;
      const res = await fetch(withBase(`/api/public/photo?nodeId=${encodeURIComponent(nodeId)}`), {
        method: "POST",
        headers: { "Content-Type": photo.type || "image/jpeg", "x-lead-token": getToken() ?? "", "x-chat-locale": chatLocale },
        body: photo,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new ApiError(res.status, data.error ?? connectionError());
      return data.url;
    },
    async tarot(nodeId, productId) {
      const r = await post<{ cards: TarotCard[] | null }>("/api/public/tarot", { token: getToken(), nodeId, productId });
      return r.cards;
    },
    async callVideo(nodeId, productId) {
      const r = await post<{ video: CallVideo | null }>("/api/public/call", { token: getToken(), nodeId, productId });
      return r.video;
    },
    async livePreview() {
      await chain;
      try {
        const r = await post<{ message: Omit<ServerMessage, "sender" | "nodeId"> }>("/api/public/live-preview", { token: getToken() });
        return { ...r.message, sender: "bot", nodeId: null } as ServerMessage;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 410 || e.status === 404)) return null;
        throw e;
      }
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
  products: Record<string, { price: number; currency?: string }>,
  graphOfferProduct: (nodeId: string) => string | undefined,
  nodeUrl: (nodeId: string) => string | undefined = () => undefined,
  /** preview do Cérebro: cérebro e objetivo do bloco (conversa de teste pelo painel, nada é gravado) */
  aiNode: (nodeId: string) => { brainId?: string; goal?: string; videoId?: string } | undefined = () => undefined,
  /** ofertas ligadas na saída "Mostrar botões de oferta" do bloco (undefined = saída não ligada) */
  aiFlowOffers: (nodeId: string) => { productId: string; headline?: string; button?: string }[] | undefined = () => undefined,
  /** país do fluxo (idioma da IA no preview) */
  language: "pt-BR" | "es-MX" | "es-AR" = "pt-BR",
  /** Canal VIP AO VIVO: as prévias do fluxo (o preview do painel lê direto da configuração) */
  livePreviews: () => Promise<LivePreview[]> = async () => [],
): ChatTransport {
  let previewsShown = 0;
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
      const currency = products[productId]?.currency ?? "BRL";
      // pesos: transferência com CLABE de exemplo (no Brasil, o PIX copia e cola de exemplo)
      const pesos = currency !== "BRL";
      const p: PublicPaymentInfo = {
        id: `preview_${++seq}`,
        status: "PENDING",
        method: form.method,
        amount: products[productId]?.price ?? 0,
        currency,
        ...(pesos
          ? {
              nextAction: {
                type: "bank_transfer",
                details: { clabe: "000000000000000000", beneficiary: "Vista previa" },
                instructions: { title: language === "es-AR" ? "Así pagás por transferencia" : "Cómo pagar por SPEI", steps: [] },
              },
            }
          : {}),
        pixQrCode: form.method !== "PIX" ? null : pesos ? "000000000000000000" : "00020126PREVIEW-HOTSECRET-PIX-CODE5204000053039865802BR",
        pixQrCodeBase64: null,
        redirectUrl: null,
        offerNodeId,
        productId,
        provider: "preview",
      };
      payments.set(p.id, p);
      return p;
    },
    // pré-visualização: nada é cobrado, então não pede dados do comprador
    async paymentMethods() {
      return null;
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
    async voiceCallEnded(nodeId, callId, seconds) {
      const brainId = aiNode(nodeId)?.brainId;
      const history = aiHistory.get(nodeId);
      history?.push({ role: "lead", text: `[atendeu a ligação de voz e ouviu ${seconds}s da sua fala]` });
      if (!brainId) return { endText: null, offer: null };
      const res = await fetch(withBase(`/api/admin/brains/${brainId}`));
      if (!res.ok) return { endText: null, offer: null };
      const { brain } = (await res.json()) as {
        brain: { voiceCalls?: { id: string; offerId?: string; endText?: string }[]; offers: { id: string; productId: string; headline?: string; ctaLabel?: string }[] };
      };
      const call = brain.voiceCalls?.find((v) => v.id === callId);
      const o = call?.offerId ? brain.offers.find((x) => x.id === call.offerId) : undefined;
      if (call?.endText) history?.push({ role: "bot", text: call.endText });
      return {
        endText: call?.endText || null,
        offer: o && products[o.productId] ? { productId: o.productId, headline: o.headline, ctaLabel: o.ctaLabel, style: "card" } : null,
      };
    },
    async sendPhoto(_nodeId, photo) {
      return URL.createObjectURL(photo); // preview: nada é enviado
    },
    async tarot(nodeId, productId) {
      const paid = [...payments.values()].some((p) => p.offerNodeId === nodeId && p.status === "APPROVED" && (!productId || p.productId === productId));
      if (!paid) return null;
      const brainId = aiNode(nodeId)?.brainId;
      if (!brainId) return null;
      const res = await fetch(withBase(`/api/admin/brains/${brainId}`));
      if (!res.ok) return null;
      const { brain } = (await res.json()) as { brain: { offers: { productId: string; style?: string; tarotCards?: TarotCard[] }[] } };
      return brain.offers.find((o) => o.productId === productId && o.style === "tarot")?.tarotCards ?? null;
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
        videoId = brain.offers.find((o) => (o.productId === productId || (o as { downsellProductId?: string }).downsellProductId === productId) && (o.style === "call" || o.style === "live"))?.videoId;
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
      else if (event === "photo") history.push({ role: "lead", text: "[enviou uma foto]" });
      else if (event === "continue" && message) history.push({ role: "lead", text: message });
      else if (event === "voice_declined") history.push({ role: "lead", text: "[recusou a ligação de voz]" });
      else if (message !== null) history.push({ role: "lead", text: message });
      if (!cfg?.brainId) return { messages: ["(preview) Selecione um cérebro neste bloco."], audio: null, offer: null, end: false };
      try {
        const r = await post<{
          messages: string[];
          audio: { url: string } | null;
          image: { url: string; kind?: "image" | "video" } | null;
          offer: AiReply["offer"];
          end: boolean;
          showOffers?: boolean;
          voiceCall?: { id: string; url: string } | null;
        }>(
          `/api/admin/brains/${cfg.brainId}/test`,
          { history, goal: cfg.goal, flowOffers: aiFlowOffers(nodeId), language },
        );
        for (const m of r.messages) history.push({ role: "bot", text: m });
        if (r.image) history.push({ role: "bot", text: r.image.kind === "video" ? "[enviou um vídeo]" : "[enviou uma foto]" });
        if (r.audio) history.push({ role: "bot", text: "[enviou um áudio]" });
        if (r.offer) history.push({ role: "bot", text: `[${r.offer.style === "call" ? "ligou para o lead com a oferta" : r.offer.style === "tarot" ? "mostrou as cartas de tarot da oferta" : "mostrou o card da oferta"} ${r.offer.headline ?? ""}]` });
        if (r.showOffers) history.push({ role: "bot", text: "[mostrou os botões de oferta]" });
        if (r.voiceCall) history.push({ role: "bot", text: "[ligou para o lead (ligação de voz)]" });
        return {
          messages: r.messages,
          audio: r.audio ? { url: r.audio.url } : null,
          image: r.image ? { url: r.image.url, kind: r.image.kind } : null,
          offer: r.offer,
          end: r.end,
          showOffers: r.showOffers,
          voiceCall: r.voiceCall ? { id: r.voiceCall.id, url: r.voiceCall.url } : null,
        };
      } catch (e) {
        return { messages: [`(preview) ${e instanceof Error ? e.message : "Falha na IA"}`], audio: null, offer: null, end: false };
      }
    },
    async livePreview() {
      const list = (await livePreviews()).filter((p) => p.url);
      const p = list[previewsShown];
      if (!p) return null;
      previewsShown++;
      return {
        id: `preview_live_${previewsShown}`,
        sender: "bot",
        type: p.kind,
        content: { url: p.url, caption: p.caption ?? "", livePreview: { n: previewsShown, total: list.length } },
        nodeId: null,
        createdAt: new Date().toISOString(),
      } as ServerMessage;
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
