import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildZenithCheckoutPayload,
  clearZenithCatalogCache,
  fetchZenithCatalog,
  publicNextAction,
  sendZenithIntent,
  usableZenithMethods,
  getZenithCheckoutStatus,
  needsFullName,
  validPersonName,
  zenithCopyValue,
  zenithFormFields,
  ZenithValidationError,
  type ZenithMethod,
} from "../src/services/payments/zenith";
import { consumeZenithEvent, parseZenithEvent, verifyZenithSignature, type ZenithWebhookStore } from "../src/services/payments/zenith-events";
import { checkoutSchema } from "../src/lib/validation";

process.env.ZENITH_PUBLIC_KEY = "pk_test_publica";
process.env.ZENITH_SECRET_KEY = "sk_test_secreta";
delete process.env.ZENITH_ENVIRONMENT;

// catálogo SPEI publicado pela Zenith (documentação oficial)
const SPEI: ZenithMethod = {
  code: "spei",
  displayName: "SPEI",
  category: "bank",
  renderer: "confirmation",
  iconUrl: "https://api.zenithworld.com.br/elements/icons/spei.svg",
  fields: [],
  customerFields: [
    { name: "firstName", label: "Nome", type: "text", required: true, maxLength: 70 },
    { name: "lastName", label: "Sobrenome", type: "text", required: true, maxLength: 70 },
    { name: "documentType", label: "Tipo de documento", type: "select", required: true, options: [{ value: "rfc", label: "RFC" }] },
    { name: "documentNumber", label: "RFC", type: "text", required: true, maxLength: 13 },
    { name: "birthDate", label: "Data de nascimento", type: "date", required: true },
    { name: "birthCountry", label: "País de nascimento", type: "select", required: true, options: [{ value: "MX", label: "México" }] },
  ],
  requiredPayloadFields: [
    "headers.Idempotency-Key", "amount", "currency", "country", "environment", "paymentMethod", "referenceId", "customerName",
    "customerEmail", "returnUrl", "cancelUrl", "metadata.firstName", "metadata.lastName", "metadata.documentType",
    "metadata.documentNumber", "metadata.birthDate", "metadata.birthCountry",
  ],
  amountLimits: { currency: "MXN", minimumAmount: 1, maximumAmount: 2000000000 },
  capabilities: { secureCard: false, redirect: true, asynchronous: true, hostedCheckout: true },
};

const ANA = { firstName: "Ana", lastName: "Silva", documentType: "rfc", documentNumber: "XAXX010101000", birthDate: "1990-01-15", birthCountry: "MX" };

const payloadInput = (customer: Record<string, string> = ANA) => ({
  method: SPEI,
  amount: 10990,
  currency: "MXN",
  country: "MX",
  referenceId: "pedido-123",
  customer,
  email: "comprador@gmail.com",
  returnUrl: "https://sualoja.com/obrigado",
  cancelUrl: "https://sualoja.com/carrinho",
});

const CREATED = {
  checkout: { id: "checkout_1", referenceId: "pedido-123", amount: 10990, currency: "MXN", status: "pending" },
  payment: { status: "pending" },
  method: { code: "spei", displayName: "SPEI" },
  nextAction: {
    type: "bank_transfer",
    details: { clabe: "646180000000000000", beneficiary: "Zenith Seller" },
    instructions: { locale: "es-419", title: "Cómo pagar por SPEI", steps: ["Abre la aplicación o el sitio web de tu banco.", "Selecciona una transferencia SPEI."] },
  },
};

type Call = { url: string; init: RequestInit };
function mockFetch(responses: ((url: string, init: RequestInit) => Promise<Response> | Response)[]) {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return next(url, init);
  };
  return { impl, calls };
}
const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
/** simula a Zenith sem responder: só termina quando o timeout aborta a requisição */
const hang = () => (_url: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    // o timer do AbortSignal.timeout não segura o processo vivo: este segura até o abort
    const keep = setInterval(() => undefined, 1000);
    init.signal?.addEventListener("abort", () => {
      clearInterval(keep);
      reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    });
  });

const intent = (body = JSON.stringify(buildZenithCheckoutPayload(payloadInput()))) => ({
  idempotencyKey: "0b6a5a8e-3d0f-4c0e-9a51-6c1f6ad5b2c1",
  body,
  referenceId: "pedido-123",
  amount: 10990,
  currency: "MXN",
});
const noSleep = async () => undefined;

beforeEach(() => clearZenithCatalogCache());

test("catálogo: consultado em runtime com as credenciais só nos cabeçalhos", async () => {
  const { impl, calls } = mockFetch([json(200, { country: "MX", currency: "MXN", environment: "sandbox", items: [SPEI, { ...SPEI, code: "card", capabilities: { secureCard: true } }], conflicts: [] })]);
  const catalog = await fetchZenithCatalog("MX", "MXN", { fetchImpl: impl });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/integrations/payment-methods");
  assert.deepEqual(Object.fromEntries(url.searchParams), { country: "MX", currency: "MXN", environment: "sandbox" });
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h["X-API-Key"], "pk_test_publica");
  assert.equal(h["X-API-Secret"], "sk_test_secreta");
  assert.ok(!calls[0].url.includes("sk_test"), "a secret nunca vai na URL");
  // cartão (secureCard) exige Zenith Elements: fica fora deste checkout
  assert.deepEqual(usableZenithMethods(catalog, 10990).map((m) => m.code), ["spei"]);
  assert.deepEqual(usableZenithMethods(catalog, 0), [], "abaixo do mínimo do catálogo");
});

test("payload: montado de requiredPayloadFields + customerFields (igual ao exemplo oficial)", () => {
  const p = buildZenithCheckoutPayload(payloadInput());
  assert.deepEqual(p, {
    amount: 10990,
    currency: "MXN",
    country: "MX",
    environment: "sandbox",
    paymentMethod: "spei",
    referenceId: "pedido-123",
    metadata: ANA,
    customerEmail: "comprador@gmail.com",
    customerName: "Ana Silva",
    returnUrl: "https://sualoja.com/obrigado",
    cancelUrl: "https://sualoja.com/carrinho",
  });
});

test("payload: campos obrigatórios e opções do catálogo são validados", () => {
  const { documentNumber: _d, ...semRfc } = ANA;
  assert.throws(() => buildZenithCheckoutPayload(payloadInput(semRfc)), (e) => e instanceof ZenithValidationError && e.fields.documentNumber === "required");
  assert.throws(() => buildZenithCheckoutPayload(payloadInput({ ...ANA, documentType: "curp" })), (e) => e instanceof ZenithValidationError && e.fields.documentType === "invalid_option");
  assert.throws(() => buildZenithCheckoutPayload(payloadInput({ ...ANA, birthDate: "15/01/1990" })), (e) => e instanceof ZenithValidationError && e.fields.birthDate === "invalid_date");
  assert.throws(() => buildZenithCheckoutPayload({ ...payloadInput(), email: "x" }), (e) => e instanceof ZenithValidationError && e.fields.email === "invalid_email");
});

test("Argentina: DNI vai no payload quando o catálogo publica o documento como obrigatório", () => {
  const AR: ZenithMethod = {
    ...SPEI,
    code: "transferencia",
    customerFields: [
      { name: "firstName", required: true },
      { name: "lastName", required: true },
      { name: "documentType", type: "select", required: true, options: [{ value: "dni", label: "DNI" }] },
      { name: "documentNumber", label: "DNI", required: true, maxLength: 8 },
    ],
    requiredPayloadFields: ["amount", "currency", "country", "customerName", "customerEmail", "metadata.documentType", "metadata.documentNumber"],
    amountLimits: { currency: "ARS" },
  };
  const base = { ...payloadInput(), method: AR, currency: "ARS", country: "AR" };
  const p = buildZenithCheckoutPayload({ ...base, customer: { firstName: "Juan", lastName: "Pérez", documentType: "dni", documentNumber: "30123456" } });
  assert.deepEqual(p.metadata, { firstName: "Juan", lastName: "Pérez", documentType: "dni", documentNumber: "30123456" });
  assert.throws(() => buildZenithCheckoutPayload({ ...base, customer: { firstName: "Juan", lastName: "Pérez", documentType: "dni" } }), (e) => e instanceof ZenithValidationError && e.fields.documentNumber === "required");
});

test("checkout com sucesso: Idempotency-Key no cabeçalho e o corpo persistido", async () => {
  const { impl, calls } = mockFetch([json(201, CREATED)]);
  const it = intent();
  const out = await sendZenithIntent(it, { fetchImpl: impl, sleep: noSleep });
  assert.equal(out.kind, "created");
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/integrations/checkouts");
  assert.equal((calls[0].init.headers as Record<string, string>)["Idempotency-Key"], it.idempotencyKey);
  assert.equal(calls[0].init.body, it.body);
  if (out.kind === "created") {
    assert.equal(out.result.checkoutId, "checkout_1");
    assert.equal(out.result.nextAction?.details?.clabe, "646180000000000000");
    assert.equal(publicNextAction(out.result.nextAction)?.instructions?.steps?.length, 2);
  }
});

test("falha definitiva (4xx): nada é reenviado", async () => {
  const { impl, calls } = mockFetch([json(422, { error: { code: "INVALID_DOCUMENT", message: "RFC inválido" } })]);
  const out = await sendZenithIntent(intent(), { fetchImpl: impl, sleep: noSleep });
  assert.equal(out.kind, "rejected");
  assert.equal(calls.length, 1);
  if (out.kind === "rejected") assert.equal(out.error.code, "INVALID_DOCUMENT");
});

test("timeout: resultado incerto, sem criar outra cobrança na hora", async () => {
  const { impl, calls } = mockFetch([hang()]);
  const out = await sendZenithIntent(intent(), { fetchImpl: impl, sleep: noSleep, timeoutMs: 30 });
  assert.equal(out.kind, "uncertain");
  assert.equal(calls.length, 1);
});

test("retry após 5xx: mesma chave e exatamente o mesmo corpo", async () => {
  const { impl, calls } = mockFetch([json(503, { message: "unavailable" }), json(200, CREATED)]);
  const out = await sendZenithIntent(intent(), { fetchImpl: impl, sleep: noSleep });
  assert.equal(out.kind, "created");
  assert.equal(calls.length, 2);
  const key = (c: Call) => (c.init.headers as Record<string, string>)["Idempotency-Key"];
  assert.equal(key(calls[0]), key(calls[1]));
  assert.equal(calls[0].init.body, calls[1].init.body);
});

test("5xx repetido: continua incerto (o próximo toque reenvia a mesma intenção)", async () => {
  const { impl, calls } = mockFetch([json(500, {}), json(502, {})]);
  const out = await sendZenithIntent(intent(), { fetchImpl: impl, sleep: noSleep });
  assert.equal(out.kind, "uncertain");
  assert.equal(calls.length, 2);
});

test("resposta de outra cobrança (referenceId/amount/currency diferentes) é recusada", async () => {
  const { impl } = mockFetch([json(200, { ...CREATED, checkout: { ...CREATED.checkout, amount: 1 } })]);
  const out = await sendZenithIntent(intent(), { fetchImpl: impl, sleep: noSleep });
  assert.equal(out.kind, "rejected");
});

test("cartão nunca passa pelo backend: campos de PAN/validade/CVC são recusados", () => {
  const base = { token: "t".repeat(20), offerNodeId: "o1" };
  for (const k of ["cardNumber", "cvc", "cvv", "expiryMonth", "pan"]) {
    const r = checkoutSchema.safeParse({ ...base, payer: { email: "a@b.co", customer: { [k]: "4111111111111111" } } });
    assert.equal(r.success, false, k);
  }
  assert.equal(checkoutSchema.safeParse({ ...base, payer: { email: "a@b.co", customer: ANA } }).success, true);
});

// ---------- produção (catálogo sem campos de nome) ----------

test("produção: SPEI pede só nome e e-mail — nome completo no formulário e espelhado em metadata", () => {
  process.env.ZENITH_ENVIRONMENT = "production";
  try {
    const PROD: ZenithMethod = {
      ...SPEI,
      customerFields: [],
      requiredPayloadFields: ["headers.Idempotency-Key", "amount", "currency", "country", "environment", "paymentMethod", "referenceId", "customerName", "customerEmail", "returnUrl", "cancelUrl", "metadata.customerName", "metadata.customerEmail"],
    };
    assert.equal(needsFullName(PROD), true);
    assert.deepEqual(zenithFormFields(PROD).map((f) => f.name), ["name"]);
    assert.equal(needsFullName(SPEI), false, "sandbox publica firstName/lastName");
    const p = buildZenithCheckoutPayload({ ...payloadInput({ name: "Ana Silva" }), method: PROD });
    // igual ao exemplo oficial de produção
    assert.deepEqual(p, {
      amount: 10990,
      currency: "MXN",
      country: "MX",
      environment: "production",
      paymentMethod: "spei",
      referenceId: "pedido-123",
      customerEmail: "comprador@gmail.com",
      customerName: "Ana Silva",
      metadata: { customerName: "Ana Silva", customerEmail: "comprador@gmail.com" },
      returnUrl: "https://sualoja.com/obrigado",
      cancelUrl: "https://sualoja.com/carrinho",
    });
    assert.throws(() => buildZenithCheckoutPayload({ ...payloadInput({}), method: PROD }), (e) => e instanceof ZenithValidationError && e.fields.name === "required");
  } finally {
    delete process.env.ZENITH_ENVIRONMENT;
  }
});

// ---------- contrato de produção (México: SPEI e OXXO) ----------

const OXXO: ZenithMethod = {
  code: "oxxo",
  displayName: "OXXO",
  category: "voucher",
  customerFields: [],
  requiredPayloadFields: ["headers.Idempotency-Key", "amount", "currency", "country", "environment", "paymentMethod", "referenceId", "customerName", "customerEmail", "returnUrl", "cancelUrl"],
  amountLimits: { currency: "MXN", minimumAmount: 1000, maximumAmount: 1000000 },
  capabilities: { secureCard: false },
};

test("catálogo: só SPEI por padrão; com todos liberados, SPEI antes do OXXO e OXXO só a partir do mínimo", () => {
  const catalog = { country: "MX", currency: "MXN", environment: "production", items: [OXXO, { ...SPEI, customerFields: [] }] };
  assert.deepEqual(usableZenithMethods(catalog, 10990).map((m) => m.code), ["spei"], "padrão do dono: apenas SPEI");
  assert.deepEqual(usableZenithMethods({ ...catalog, items: [OXXO] }, 10990), [], "SPEI fora do catálogo: nada é oferecido");
  process.env.ZENITH_ALLOWED_METHODS = "all";
  try {
    assert.deepEqual(usableZenithMethods(catalog, 10990).map((m) => m.code), ["spei", "oxxo"], "digital antes do presencial");
    assert.deepEqual(usableZenithMethods(catalog, 500).map((m) => m.code), ["spei"], "OXXO exige MX$ 10,00");
  } finally {
    delete process.env.ZENITH_ALLOWED_METHODS;
  }
});

test("produção: campos 'Nome completo' e 'E-mail' do catálogo não aparecem em dobro no formulário", () => {
  const PROD_FIELDS: ZenithMethod = {
    ...SPEI,
    customerFields: [
      { name: "customerName", label: "Nome completo", type: "text", required: true },
      { name: "customerEmail", label: "E-mail", type: "email", required: true },
    ],
    requiredPayloadFields: OXXO.requiredPayloadFields,
  };
  assert.deepEqual(zenithFormFields(PROD_FIELDS).map((f) => f.name), ["name"], "só nome completo (o e-mail é o campo fixo)");
  const p = buildZenithCheckoutPayload({ ...payloadInput({ name: "Ana Silva" }), method: PROD_FIELDS });
  assert.equal(p.customerName, "Ana Silva");
  assert.equal(p.customerEmail, "comprador@gmail.com");
  assert.equal(p.metadata, undefined, "nada inventado fora do que o catálogo pede");
});

test("nome e sobrenome reais (a Zenith recusa nomes fictícios)", () => {
  for (const ok of ["Ana Silva", "Juan Pérez Pérez", "María de la Cruz", "José Ortega y Gasset"]) assert.equal(validPersonName(ok), true, ok);
  for (const bad of ["Ana", "A Silva", "Ana Ana", "aaaa bbbb", "Juan 2", "Test User", "Ana S."]) assert.equal(validPersonName(bad), false, bad);
  assert.throws(
    () => buildZenithCheckoutPayload({ ...payloadInput({ name: "Ana" }), method: OXXO }),
    (e) => e instanceof ZenithValidationError && e.fields.name === "invalid_name",
  );
});

test("nextAction: voucher (OXXO) e bank_transfer (SPEI) exibem só o que veio", () => {
  const voucher = publicNextAction({ type: "voucher", code: "93000012345678", instructions: { title: "Cómo pagar en OXXO", steps: ["Acude a una tienda OXXO participante."] } })!;
  assert.equal(voucher.code, "93000012345678");
  assert.equal(zenithCopyValue(voucher), "93000012345678");
  const transfer = publicNextAction({ type: "bank_transfer", details: { clabe: "646180000000000000", bankName: "STP", reference: "pedido-123", extra: { nested: true } } })!;
  assert.deepEqual(transfer.details, { clabe: "646180000000000000", bankName: "STP", reference: "pedido-123" }, "só textos");
  assert.equal(zenithCopyValue(transfer), "646180000000000000");
  const redirect = publicNextAction({ type: "redirect", url: "javascript:alert(1)" })!;
  assert.equal(redirect.url, undefined, "só https");
  const app = publicNextAction({ type: "app_approval", app: { name: "Banco X", deepLink: { x: 1 } } })!;
  assert.deepEqual(app.app, { name: "Banco X" });
});

test("consulta de estado: GET /integrations/checkouts/:id (só para a experiência, não libera pedido)", async () => {
  const { impl, calls } = mockFetch([json(200, { checkout: { id: "checkout_1", status: "canceled" } })]);
  assert.equal(await getZenithCheckoutStatus("checkout_1", { fetchImpl: impl }), "canceled");
  assert.equal(new URL(calls[0].url).pathname, "/integrations/checkouts/checkout_1");
  assert.equal(await getZenithCheckoutStatus("../../etc"), null, "id inválido nem é consultado");
});

test("retry idempotente: a resposta guarda checkout.id e payment.id da intenção", async () => {
  const { impl, calls } = mockFetch([json(502, {}), json(200, { ...CREATED, payment: { id: "pay_zen_1", status: "pending" } })]);
  const it = intent();
  const out = await sendZenithIntent(it, { fetchImpl: impl, sleep: noSleep });
  assert.equal(out.kind, "created");
  if (out.kind === "created") assert.deepEqual([out.result.checkoutId, out.result.paymentId], ["checkout_1", "pay_zen_1"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body, calls[1].init.body);
});

// ---------- webhook (documentação oficial) ----------

const SECRET = "whsec_teste_local";
const sign = (body: string, opts: { ts?: number; secret?: string; id?: string; type?: string } = {}) => {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return {
    headers: {
      "x-zenith-event-id": opts.id ?? "evt_1",
      "x-zenith-event-type": opts.type ?? "payment.captured",
      "x-zenith-timestamp": String(ts),
      "x-zenith-signature": createHmac("sha256", opts.secret ?? SECRET).update(`${ts}.`).update(body).digest("hex"),
    } as Record<string, string>,
    query: {},
    rawBody: body,
  };
};

const EVENT = { id: "evt_1", type: "payment.captured", data: { referenceId: "pay_1", amount: 10990, currency: "MXN", checkoutId: "checkout_1", paymentId: "pay_zen_1" } };
const RAW = JSON.stringify(EVENT);

test("webhook: HMAC-SHA256 de \"<timestamp>.<corpo bruto>\", janela de 300 s e cabeçalhos obrigatórios", () => {
  assert.deepEqual(verifyZenithSignature(sign(RAW), SECRET), { ok: true });
  assert.equal(verifyZenithSignature(sign(RAW), undefined).ok, false, "sem segredo: recusa");
  assert.equal(verifyZenithSignature(sign(RAW, { secret: "outro" }), SECRET).ok, false, "segredo errado");
  assert.equal(verifyZenithSignature({ ...sign(RAW), rawBody: RAW.replace("10990", "1") }, SECRET).ok, false, "corpo alterado");
  assert.equal(verifyZenithSignature(sign(RAW, { ts: Math.floor(Date.now() / 1000) - 301 }), SECRET).ok, false, "timestamp velho");
  assert.equal(verifyZenithSignature(sign(RAW, { ts: Math.floor(Date.now() / 1000) + 301 }), SECRET).ok, false, "timestamp no futuro");
  const noId = sign(RAW);
  delete noId.headers["x-zenith-event-id"];
  assert.equal(verifyZenithSignature(noId, SECRET).ok, false, "sem X-Zenith-Event-Id");
  const noType = sign(RAW);
  delete noType.headers["x-zenith-event-type"];
  assert.equal(verifyZenithSignature(noType, SECRET).ok, false, "sem X-Zenith-Event-Type");
  assert.equal(verifyZenithSignature({ ...sign(RAW), rawBody: JSON.stringify(EVENT, null, 2) }, SECRET).ok, false, "vale o corpo bruto");
});

test("webhook: só payment.captured e checkout.succeeded liberam; tipo do corpo precisa bater com o cabeçalho", () => {
  const ev = parseZenithEvent(sign(RAW))!;
  assert.equal(ev.id, "evt_1");
  assert.equal(ev.action, "approve");
  assert.deepEqual([ev.referenceId, ev.amount, ev.currency, ev.checkoutId, ev.paymentId], ["pay_1", 10990, "MXN", "checkout_1", "pay_zen_1"]);
  const as = (type: string) => parseZenithEvent(sign(JSON.stringify({ ...EVENT, type }), { type }))!.action;
  assert.equal(as("checkout.succeeded"), "approve");
  assert.equal(as("payment.failed"), "fail");
  assert.equal(as("payment.pending"), "ignore", "pendente nunca é receita");
  assert.equal(as("deposit.credited"), "deposit");
  assert.equal(parseZenithEvent(sign(RAW, { type: "payment.pending" })), null, "cabeçalho diferente do corpo assinado");
  assert.equal(parseZenithEvent({ headers: {}, rawBody: RAW }), null, "sem cabeçalhos");
});

function memoryStore(payment = { id: "pay_1", provider: "zenith", amount: 10990, currency: "MXN", providerPaymentId: "checkout_1" as string | null, gatewayPaymentId: "pay_zen_1" as string | null }) {
  const processed = new Set<string>();
  const applied: string[] = [];
  let failNext = false;
  const store: ZenithWebhookStore = {
    findPayment: async (id) => (id === payment.id ? payment : null),
    markProcessed: async (key) => (processed.has(key) ? false : (processed.add(key), true)),
    unmark: async (key) => void processed.delete(key),
    apply: async (_id, status) => {
      if (failNext) {
        failNext = false;
        throw new Error("db");
      }
      applied.push(status);
    },
  };
  return { store, applied, processed, failOnce: () => (failNext = true) };
}

test("webhook repetido: o mesmo X-Zenith-Event-Id é aplicado uma única vez", async () => {
  const { store, applied } = memoryStore();
  const ev = parseZenithEvent(sign(RAW))!;
  assert.equal(await consumeZenithEvent(ev, store), "applied");
  assert.equal(await consumeZenithEvent(ev, store), "duplicate");
  // mesmo corpo assinado reenviado com outro X-Zenith-Event-Id (o cabeçalho não é assinado): continua duplicado
  assert.equal(await consumeZenithEvent({ ...ev, id: "evt_forjado" }, store), "duplicate");
  assert.deepEqual(applied, ["APPROVED"]);
});

test("webhook: referenceId, amount, currency, checkoutId e paymentId precisam bater com o pedido", async () => {
  const { store, applied } = memoryStore();
  const ev = parseZenithEvent(sign(RAW))!;
  assert.equal(await consumeZenithEvent({ ...ev, amount: 1 }, store), "amount_mismatch");
  assert.equal(await consumeZenithEvent({ ...ev, amount: null }, store), "amount_missing");
  assert.equal(await consumeZenithEvent({ ...ev, currency: "BRL" }, store), "currency_mismatch");
  assert.equal(await consumeZenithEvent({ ...ev, currency: null }, store), "currency_missing");
  assert.equal(await consumeZenithEvent({ ...ev, referenceId: "outro" }, store), "unknown_payment");
  assert.equal(await consumeZenithEvent({ ...ev, checkoutId: "checkout_9" }, store), "checkout_mismatch");
  assert.equal(await consumeZenithEvent({ ...ev, paymentId: "pay_zen_9" }, store), "payment_mismatch");
  assert.equal(await consumeZenithEvent({ ...ev, action: "ignore" }, store), "ignored");
  assert.deepEqual(applied, []);
});

test("webhook: payment.failed recusa sem exigir valor; deposit.credited só registra (nunca vira venda)", async () => {
  const { store, applied, processed } = memoryStore();
  const failed = parseZenithEvent(sign(JSON.stringify({ id: "evt_f", type: "payment.failed", data: { referenceId: "pay_1" } }), { id: "evt_f", type: "payment.failed" }))!;
  assert.equal(await consumeZenithEvent(failed, store), "applied");
  const dep = parseZenithEvent(
    sign(JSON.stringify({ id: "evt_d", type: "deposit.credited", data: { depositId: "dep_1", amount: 10990, currency: "MXN", reconciliationReason: "UNMATCHED" } }), { id: "evt_d", type: "deposit.credited" }),
  )!;
  assert.equal(await consumeZenithEvent(dep, store), "deposit_recorded");
  assert.equal(await consumeZenithEvent({ ...dep, id: "evt_d2", bodyId: "evt_d2" }, store), "duplicate", "mesmo depositId");
  assert.ok(processed.has("deposit:dep_1"));
  assert.deepEqual(applied, ["FAILED"], "o depósito avulso não aprovou nada");
});

test("webhook: falha ao aplicar libera o id para a Zenith reenviar", async () => {
  const { store, applied, failOnce } = memoryStore();
  const ev = parseZenithEvent(sign(RAW))!;
  failOnce();
  await assert.rejects(consumeZenithEvent(ev, store));
  assert.equal(await consumeZenithEvent(ev, store), "applied");
  assert.deepEqual(applied, ["APPROVED"]);
});
