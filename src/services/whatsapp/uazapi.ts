// uazapi (uazapiGO, WhatsApp não oficial hospedado): envio de mensagens e configuração da instância.
// Autenticação pelo header "token" (token da instância); o servidor é https://<subdominio>.uazapi.com.

export interface UazapiConfig {
  url: string;
  key: string;
}

export class UazapiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T = Record<string, unknown>>(cfg: UazapiConfig, path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers: { token: cfg.key, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
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
    const d = data as { error?: unknown; message?: unknown } | null;
    throw new UazapiError(res.status, `uazapi ${res.status}: ${String(d?.error ?? d?.message ?? text.slice(0, 200))}`);
  }
  return (data ?? {}) as T;
}

/** id da mensagem enviada (a uazapi devolve a mensagem criada) */
const sentId = (r: { messageid?: unknown; id?: unknown; key?: { id?: unknown } }) =>
  typeof r?.messageid === "string" ? r.messageid : typeof r?.id === "string" ? r.id : typeof r?.key?.id === "string" ? r.key.id : null;

/** texto; delay = tempo "digitando..." antes de enviar (ms) */
export async function sendText(cfg: UazapiConfig, number: string, text: string, delay = 0) {
  return sentId(await call(cfg, "/send/text", { number, text, ...(delay ? { delay } : {}) }));
}

/** foto, vídeo ou documento por link; ptt = mensagem de voz */
export async function sendMedia(cfg: UazapiConfig, number: string, type: "image" | "video" | "document" | "ptt", file: string, caption?: string) {
  return sentId(await call(cfg, "/send/media", { number, type, file, ...(caption ? { text: caption } : {}) }));
}

/** estado da conexão: connected, connecting, disconnected, hibernated */
export async function connectionState(cfg: UazapiConfig): Promise<string> {
  const r = await call<{ instance?: { status?: unknown }; status?: unknown }>(cfg, "/instance/status");
  const st = r.instance?.status ?? r.status;
  if (typeof st === "string") return st;
  // formato { status: { connected: true, loggedIn: true } }
  const o = st as { connected?: unknown } | undefined;
  return o?.connected === true ? "connected" : "disconnected";
}

/** liga o webhook da instância nas mensagens (as enviadas pela própria API ficam de fora, evita eco) */
export async function setWebhook(cfg: UazapiConfig, url: string) {
  return call(cfg, "/webhook", { url, enabled: true, events: ["messages"], excludeMessages: ["wasSentByApi", "isGroupYes"] });
}
