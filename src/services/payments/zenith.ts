// Zenith Payments API — https://docs.zenithworld.com.br/
// - Catálogo: GET /integrations/payment-methods?country&currency&environment (consultado em runtime;
//   nenhum método é fixo no código — o payload sai de requiredPayloadFields, customerFields e fields)
// - Cobrança: POST /integrations/checkouts com Idempotency-Key (UUID persistido por intenção de compra;
//   um retry reenvia exatamente o mesmo corpo com a mesma chave)
// - Credenciais SÓ no servidor: ZENITH_PUBLIC_KEY (X-API-Key) e ZENITH_SECRET_KEY (X-API-Secret).
//   Nunca vão para o navegador, URL, payload ou log.
// - Timeout, falha de rede e 5xx = resultado INCERTO: a cobrança pode ter sido criada. Antes de criar outra,
//   a mesma intenção é reenviada com a mesma chave (a Zenith devolve a cobrança já criada).
// - Pagamento só é confirmado por webhook assinado com ZENITH_WEBHOOK_SECRET (ver zenith-events.ts).

const DEFAULT_BASE_URL = "https://api.zenithworld.com.br";
const CATALOG_TTL_MS = 5 * 60_000;

export type ZenithEnvironment = "sandbox" | "production";

/** Ambiente da Zenith: sandbox por padrão; cobrança real só com ZENITH_ENVIRONMENT=production. */
export function zenithEnvironment(): ZenithEnvironment {
  return process.env.ZENITH_ENVIRONMENT === "production" ? "production" : "sandbox";
}

function baseUrl(): string {
  return (process.env.ZENITH_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function zenithConfigured(): boolean {
  return !!(process.env.ZENITH_PUBLIC_KEY && process.env.ZENITH_SECRET_KEY);
}

/** País da Zenith pela moeda do produto. */
export const ZENITH_COUNTRY: Record<string, string> = { MXN: "MX", ARS: "AR" };

export interface ZenithFieldOption {
  value: string;
  label?: string;
}
export interface ZenithField {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  autocomplete?: string;
  maxLength?: number;
  placeholder?: string;
  options?: ZenithFieldOption[];
}
export interface ZenithMethod {
  code: string;
  displayName?: string;
  category?: string;
  renderer?: string;
  iconKey?: string;
  iconUrl?: string;
  fields?: ZenithField[];
  customerFields?: ZenithField[];
  requiredPayloadFields?: string[];
  amountLimits?: { currency?: string; minimumAmount?: number; maximumAmount?: number };
  capabilities?: { secureCard?: boolean; redirect?: boolean; asynchronous?: boolean; hostedCheckout?: boolean };
}
export interface ZenithCatalog {
  country: string;
  currency: string;
  environment: string;
  items: ZenithMethod[];
  conflicts?: unknown[];
}

/**
 * config: credenciais ausentes · rejected: a Zenith recusou (4xx, nada foi criado) ·
 * uncertain: timeout/rede/5xx/429 (pode ter sido criada — reenviar com a mesma chave).
 */
export class ZenithError extends Error {
  constructor(
    public kind: "config" | "rejected" | "uncertain",
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Dados do comprador inválidos ou faltando (mensagem por campo, para o formulário). */
export class ZenithValidationError extends Error {
  constructor(public fields: Record<string, string>) {
    super("Dados do comprador inválidos");
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface RequestOpts {
  query?: Record<string, string>;
  /** corpo já serializado (o retry reenvia exatamente os mesmos bytes) */
  body?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

async function zenithRequest<T>(method: "GET" | "POST", path: string, opts: RequestOpts = {}): Promise<T> {
  const publicKey = process.env.ZENITH_PUBLIC_KEY;
  const secretKey = process.env.ZENITH_SECRET_KEY;
  if (!publicKey || !secretKey) throw new ZenithError("config", 0, "ZENITH_PUBLIC_KEY / ZENITH_SECRET_KEY não configuradas");
  const url = new URL(baseUrl() + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const doFetch = opts.fetchImpl ?? ((u: string, init: RequestInit) => fetch(u, init));

  let res: Response;
  try {
    res = await doFetch(url.toString(), {
      method,
      headers: {
        "X-API-Key": publicKey,
        "X-API-Secret": secretKey,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: opts.body,
      redirect: "error",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    // nunca logar headers: levam as credenciais
    console.error("[zenith]", method, path, timeout ? "timeout" : "falha de rede");
    throw new ZenithError("uncertain", 0, timeout ? "timeout" : "falha de rede");
  }

  const text = await res.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const d = data as { message?: string; error?: string | { message?: string; code?: string }; code?: string };
    const msg = typeof d.error === "object" ? d.error?.message : (d.message ?? d.error);
    const code = typeof d.error === "object" ? d.error?.code : d.code;
    console.error("[zenith]", method, path, res.status, code ?? "", msg ?? "");
    // 5xx: o servidor pode ter processado; 429: não processou, mas a regra é a mesma (reenviar com a mesma chave)
    const kind = res.status >= 500 || res.status === 429 ? "uncertain" : "rejected";
    throw new ZenithError(kind, res.status, msg || `Zenith respondeu ${res.status}`, code);
  }
  return data as T;
}

const catalogCache = new Map<string, { at: number; catalog: ZenithCatalog }>();

/** Métodos liberados para o país/moeda no ambiente atual (cache curto em memória). */
export async function fetchZenithCatalog(country: string, currency: string, opts: { fetchImpl?: FetchLike; fresh?: boolean } = {}): Promise<ZenithCatalog> {
  const environment = zenithEnvironment();
  const key = `${environment}|${country}|${currency}`;
  const hit = catalogCache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.catalog;
  const data = await zenithRequest<Partial<ZenithCatalog>>("GET", "/integrations/payment-methods", {
    query: { country, currency, environment },
    fetchImpl: opts.fetchImpl,
    timeoutMs: 10_000,
  });
  const catalog: ZenithCatalog = {
    country: data.country ?? country,
    currency: data.currency ?? currency,
    environment: data.environment ?? environment,
    items: Array.isArray(data.items) ? data.items.filter((i): i is ZenithMethod => !!i && typeof i.code === "string") : [],
    conflicts: data.conflicts ?? [],
  };
  catalogCache.set(key, { at: Date.now(), catalog });
  return catalog;
}

export function clearZenithCatalogCache() {
  catalogCache.clear();
}

/**
 * Métodos que este checkout consegue cobrar pela Payments API: cartão (secureCard) exige os campos
 * hospedados do Zenith Elements e fica de fora — nunca coletamos número/validade/CVC.
 */
export function usableZenithMethods(catalog: ZenithCatalog, amount: number): ZenithMethod[] {
  return catalog.items.filter((m) => {
    if (m.capabilities?.secureCard || m.category === "card") return false;
    const lim = m.amountLimits;
    if (lim?.currency && lim.currency !== catalog.currency) return false;
    if (typeof lim?.minimumAmount === "number" && amount < lim.minimumAmount) return false;
    if (typeof lim?.maximumAmount === "number" && amount > lim.maximumAmount) return false;
    return true;
  });
}

/** Campos que o comprador preenche (customerFields + fields do método). */
export function zenithInputFields(method: ZenithMethod): ZenithField[] {
  const seen = new Set<string>();
  return [...(method.customerFields ?? []), ...(method.fields ?? [])].filter((f) => {
    if (!f?.name || seen.has(f.name)) return false;
    // campo de cartão nunca é coletado aqui (só nos campos hospedados do Zenith Elements)
    if (/^(card|pan$|cvc|cvv|cvn|expir|exp(month|year)|securitycode)/i.test(f.name)) return false;
    seen.add(f.name);
    return true;
  });
}

const endsWith = (path: string, name: string) => path === name || path.endsWith(`.${name}`);

/**
 * O catálogo exige o nome do comprador (customerName em qualquer caminho) mas não publica campos de nome
 * (ex.: SPEI em produção): o formulário pede "nome completo".
 */
export function needsFullName(method: ZenithMethod): boolean {
  const names = new Set(zenithInputFields(method).map((f) => f.name));
  return !names.has("firstName") && !names.has("name") && (method.requiredPayloadFields ?? []).some((p) => endsWith(p, "customerName"));
}

const FULL_NAME_FIELD: ZenithField = { name: "name", label: "Nombre completo", type: "text", required: true, autocomplete: "name", maxLength: 140 };

/** Campos do formulário: os do catálogo + nome completo quando o catálogo exige o nome sem publicar o campo. */
export function zenithFormFields(method: ZenithMethod): ZenithField[] {
  return [...(needsFullName(method) ? [FULL_NAME_FIELD] : []), ...zenithInputFields(method)];
}

/** Onde o campo vai no payload: o caminho publicado em requiredPayloadFields, senão metadata.<nome>. */
function payloadPath(method: ZenithMethod, name: string): string {
  const req = method.requiredPayloadFields ?? [];
  return req.find((p) => p === name) ?? req.find((p) => p.endsWith(`.${name}`) && !p.startsWith("headers.")) ?? `metadata.${name}`;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, p) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined), obj);
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export interface ZenithPayloadInput {
  method: ZenithMethod;
  amount: number;
  currency: string;
  country: string;
  referenceId: string;
  /** valores digitados pelo comprador, por nome do campo do catálogo */
  customer: Record<string, string>;
  email: string;
  returnUrl: string;
  cancelUrl: string;
}

/**
 * Monta o corpo de POST /integrations/checkouts a partir do catálogo e valida os dados do comprador.
 * Lança ZenithValidationError com a mensagem de cada campo inválido.
 */
export function buildZenithCheckoutPayload(input: ZenithPayloadInput): Record<string, unknown> {
  const { method } = input;
  const errors: Record<string, string> = {};
  const payload: Record<string, unknown> = {
    amount: input.amount,
    currency: input.currency,
    country: input.country,
    environment: zenithEnvironment(),
    paymentMethod: method.code,
    referenceId: input.referenceId,
  };

  for (const f of zenithInputFields(method)) {
    const raw = String(input.customer[f.name] ?? "").trim();
    if (!raw) {
      if (f.required) errors[f.name] = "required";
      continue;
    }
    if (f.maxLength && raw.length > f.maxLength) errors[f.name] = "too_long";
    else if (f.options?.length && !f.options.some((o) => o.value === raw)) errors[f.name] = "invalid_option";
    else if (f.type === "date" && !validIsoDate(raw)) errors[f.name] = "invalid_date";
    else if (f.type === "email" && !EMAIL_RE.test(raw)) errors[f.name] = "invalid_email";
    else setPath(payload, payloadPath(method, f.name), raw);
  }

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = email ? "invalid_email" : "required";
  else payload.customerEmail = email;
  const first = String(input.customer.firstName ?? "").trim();
  const last = String(input.customer.lastName ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ") || String(input.customer.name ?? "").trim();
  if (needsFullName(method) && !name) errors.name = "required";
  else if (name.length > 140) errors.name = "too_long";
  if (name) payload.customerName = name;
  // o catálogo pode pedir nome/e-mail também em outro caminho (ex.: metadata.customerName em produção)
  for (const path of method.requiredPayloadFields ?? []) {
    if (path.startsWith("headers.") || getPath(payload, path) !== undefined) continue;
    if (endsWith(path, "customerName") && name) setPath(payload, path, name);
    else if (endsWith(path, "customerEmail") && payload.customerEmail) setPath(payload, path, payload.customerEmail);
  }
  payload.returnUrl = input.returnUrl;
  payload.cancelUrl = input.cancelUrl;

  if (Object.keys(errors).length) throw new ZenithValidationError(errors);
  // tudo o que o catálogo publica como obrigatório precisa estar preenchido
  for (const path of method.requiredPayloadFields ?? []) {
    if (path.startsWith("headers.")) continue; // Idempotency-Key vai no cabeçalho
    const v = getPath(payload, path);
    if (v === undefined || v === null || v === "") {
      const field = path.split(".").pop() || path;
      errors[field === "customerName" ? (needsFullName(method) ? "name" : "firstName") : field === "customerEmail" ? "email" : field] = "required";
    }
  }
  if (Object.keys(errors).length) throw new ZenithValidationError(errors);
  return payload;
}

function validIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getTime() < Date.now();
}

export interface ZenithNextAction {
  type: string;
  details?: Record<string, unknown>;
  instructions?: { locale?: string; title?: string; steps?: string[] };
  url?: string;
}

export interface ZenithCheckoutResult {
  checkoutId: string | null;
  referenceId: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  paymentStatus: string;
  method: { code?: string; displayName?: string; iconUrl?: string } | null;
  nextAction: ZenithNextAction | null;
}

/** POST /integrations/checkouts — body é o JSON persistido da intenção (mesmos bytes em todo retry). */
export async function postZenithCheckout(body: string, idempotencyKey: string, opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<ZenithCheckoutResult> {
  const data = await zenithRequest<Record<string, unknown>>("POST", "/integrations/checkouts", {
    body,
    idempotencyKey,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
  });
  const checkout = (data.checkout ?? {}) as Record<string, unknown>;
  const payment = (data.payment ?? {}) as Record<string, unknown>;
  const next = data.nextAction as ZenithNextAction | undefined;
  return {
    checkoutId: typeof checkout.id === "string" ? checkout.id : null,
    referenceId: typeof checkout.referenceId === "string" ? checkout.referenceId : null,
    amount: typeof checkout.amount === "number" ? checkout.amount : null,
    currency: typeof checkout.currency === "string" ? checkout.currency : null,
    status: String(checkout.status ?? ""),
    paymentStatus: String(payment.status ?? ""),
    method: (data.method as ZenithCheckoutResult["method"]) ?? null,
    nextAction: next && typeof next.type === "string" ? next : null,
  };
}

/** Status da Zenith → status interno. */
export function mapZenithStatus(s: string | undefined): "PENDING" | "APPROVED" | "FAILED" | "REFUNDED" {
  switch ((s ?? "").toLowerCase()) {
    case "paid":
    case "approved":
    case "succeeded":
    case "completed":
    case "captured":
      return "APPROVED";
    case "failed":
    case "declined":
    case "rejected":
    case "canceled":
    case "cancelled":
    case "expired":
      return "FAILED";
    case "refunded":
    case "chargeback":
    case "charged_back":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}

/** Valor que o comprador copia no app do banco (CLABE no México, CVU/alias na Argentina...). */
export function zenithCopyValue(next: ZenithNextAction | null | undefined): string | null {
  const d = next?.details;
  if (!d) return null;
  for (const k of ["clabe", "cvu", "cbu", "alias", "reference", "referenceNumber", "code"]) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** nextAction que pode ir para o navegador do comprador (só textos; URL só https). */
export function publicNextAction(v: unknown): ZenithNextAction | null {
  if (!v || typeof v !== "object") return null;
  const n = v as ZenithNextAction;
  if (typeof n.type !== "string") return null;
  const details: Record<string, string> = {};
  for (const [k, val] of Object.entries(n.details ?? {})) {
    if (/^[A-Za-z][\w-]{0,40}$/.test(k) && (typeof val === "string" || typeof val === "number")) details[k] = String(val).slice(0, 200);
  }
  const steps = Array.isArray(n.instructions?.steps) ? n.instructions!.steps.filter((s) => typeof s === "string").slice(0, 10).map((s) => s.slice(0, 300)) : [];
  const url = typeof n.url === "string" && n.url.startsWith("https://") ? n.url : undefined;
  return {
    type: n.type.slice(0, 40),
    details,
    instructions: { title: typeof n.instructions?.title === "string" ? n.instructions.title.slice(0, 200) : undefined, steps },
    ...(url ? { url } : {}),
  };
}

export type ZenithSendOutcome =
  | { kind: "created"; result: ZenithCheckoutResult }
  | { kind: "rejected"; error: ZenithError }
  | { kind: "uncertain"; error: ZenithError };

/**
 * Envia (ou reenvia) uma intenção de compra. Sempre a mesma chave e os mesmos bytes: se a primeira
 * tentativa chegou na Zenith, o retry devolve a cobrança já criada em vez de criar outra.
 * Falha rápida (rede/5xx/429) ganha um retry imediato; timeout não (o lead tenta de novo e a
 * intenção é reenviada com a mesma chave).
 */
export async function sendZenithIntent(
  intent: { idempotencyKey: string; body: string; referenceId: string; amount: number; currency: string },
  opts: { fetchImpl?: FetchLike; retries?: number; sleep?: (ms: number) => Promise<void>; timeoutMs?: number } = {},
): Promise<ZenithSendOutcome> {
  const retries = opts.retries ?? 1;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await postZenithCheckout(intent.body, intent.idempotencyKey, { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs });
      // a cobrança devolvida tem que ser exatamente a desta intenção
      if (
        (result.referenceId && result.referenceId !== intent.referenceId) ||
        (result.amount !== null && result.amount !== intent.amount) ||
        (result.currency && result.currency !== intent.currency)
      ) {
        return { kind: "rejected", error: new ZenithError("rejected", 200, "cobrança devolvida não corresponde ao pedido", "MISMATCH") };
      }
      return { kind: "created", result };
    } catch (e) {
      const err = e instanceof ZenithError ? e : new ZenithError("uncertain", 0, "falha de rede");
      if (err.kind !== "uncertain") return { kind: "rejected", error: err };
      const timedOut = err.status === 0 && err.message === "timeout";
      if (timedOut || attempt >= retries) return { kind: "uncertain", error: err };
      await sleep(err.status === 429 ? 2000 : 800 * (attempt + 1));
    }
  }
}
