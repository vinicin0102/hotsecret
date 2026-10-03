// Transporte do chat: "live" fala com a API (eventos persistidos), "preview" simula tudo em memória.
import { withBase } from "@/lib/paths";
import type { FlowNode } from "@/types/flow";
import { metaCookies } from "./pixels";

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
): ChatTransport {
  const opened = new Set<string>();
  const payments = new Map<string, PublicPaymentInfo>();
  let seq = 0;
  return {
    mode: "preview",
    track() {},
    async flush() {},
    async checkout(offerNodeId, form) {
      const productId = graphOfferProduct(offerNodeId) ?? "";
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
