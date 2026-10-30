// Evolution API (WhatsApp não oficial): envio de mensagens e configuração da instância.
// Endereço, chave e instância vêm de client.ts (variáveis de ambiente) — a chave nunca vai ao navegador nem aos logs.
export interface EvolutionConfig {
  url: string;
  key: string;
  instance: string;
}

export class EvolutionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T = Record<string, unknown>>(cfg: EvolutionConfig, path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers: { apikey: cfg.key, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = data as { response?: { message?: unknown }; message?: unknown; error?: unknown } | null;
    const msg = d?.response?.message ?? d?.message ?? d?.error ?? text.slice(0, 200);
    throw new EvolutionError(res.status, `Evolution ${res.status}: ${Array.isArray(msg) ? msg.join("; ") : String(msg)}`);
  }
  return (data ?? {}) as T;
}

/** id da mensagem enviada (a Evolution devolve a mensagem criada) */
const sentId = (r: { key?: { id?: unknown } }) => (typeof r?.key?.id === "string" ? r.key.id : null);

/** texto; delay = tempo "digitando..." antes de enviar (ms) */
export async function sendText(cfg: EvolutionConfig, number: string, text: string, delay = 0) {
  return sentId(await call(cfg, `/message/sendText/${encodeURIComponent(cfg.instance)}`, { number, text, ...(delay ? { delay } : {}) }));
}

export async function sendMedia(cfg: EvolutionConfig, number: string, mediatype: "image" | "video" | "document", media: string, caption?: string) {
  const ext = mediatype === "image" ? "jpg" : mediatype === "video" ? "mp4" : "pdf";
  return sentId(
    await call(cfg, `/message/sendMedia/${encodeURIComponent(cfg.instance)}`, {
      number,
      mediatype,
      media,
      caption: caption ?? "",
      fileName: `arquivo.${ext}`,
    }),
  );
}

/** áudio como mensagem de voz (gravado na hora) */
export async function sendAudio(cfg: EvolutionConfig, number: string, audio: string) {
  return sentId(await call(cfg, `/message/sendWhatsAppAudio/${encodeURIComponent(cfg.instance)}`, { number, audio }));
}

/** estado da conexão do número: open (conectado), connecting, close */
export async function connectionState(cfg: EvolutionConfig): Promise<string> {
  const r = await call<{ instance?: { state?: string }; state?: string }>(cfg, `/instance/connectionState/${encodeURIComponent(cfg.instance)}`);
  return r.instance?.state ?? r.state ?? "unknown";
}

/** liga o webhook da instância nas mensagens recebidas */
export async function setWebhook(cfg: EvolutionConfig, url: string) {
  return call(cfg, `/webhook/set/${encodeURIComponent(cfg.instance)}`, {
    webhook: { enabled: true, url, webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT"] },
  });
}
