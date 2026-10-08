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
  needsFullName,
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

// ---------- webhook (assinatura da documentação oficial) ----------

const SECRET = "whsec_teste_local";
const sign = (body: string, ts = Math.floor(Date.now() / 1000), secret = SECRET) => ({
  headers: {
    "x-zenith-timestamp": String(ts),
    "x-zenith-signature": createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex"),
  },
  query: {},
  rawBody: body,
});

const EVENT = { id: "evt_1", type: "payment.captured", data: { referenceId: "pay_1", amount: 10990, currency: "MXN", checkoutId: "checkout_1" } };
const RAW = JSON.stringify(EVENT);

test("webhook: assinatura HMAC de \"<timestamp>.<corpo bruto>\" com ZENITH_WEBHOOK_SECRET", () => {
  assert.deepEqual(verifyZenithSignature(sign(RAW), SECRET), { ok: true });
  assert.equal(verifyZenithSignature(sign(RAW), undefined).ok, false, "sem segredo: recusa");
  assert.equal(verifyZenithSignature(sign(RAW, undefined, "outro"), SECRET).ok, false, "segredo errado");
  assert.equal(verifyZenithSignature({ ...sign(RAW), rawBody: RAW.replace("10990", "1") }, SECRET).ok, false, "corpo alterado");
  assert.equal(verifyZenithSignature(sign(RAW, Math.floor(Date.now() / 1000) - 301), SECRET).ok, false, "timestamp velho");
  assert.equal(verifyZenithSignature(sign(RAW, Math.floor(Date.now() / 1000) + 301), SECRET).ok, false, "timestamp no futuro");
  assert.equal(verifyZenithSignature({ headers: {}, query: {}, rawBody: RAW }, SECRET).ok, false, "sem cabeçalhos");
  const reformatted = JSON.stringify(EVENT, null, 2); // mesmo JSON, bytes diferentes: vale o corpo bruto
  assert.equal(verifyZenithSignature({ ...sign(RAW), rawBody: reformatted }, SECRET).ok, false);
});

test("webhook: payment.captured vira aprovação; outros tipos são lidos pelo nome", () => {
  const ev = parseZenithEvent(RAW)!;
  assert.deepEqual(ev, { id: "evt_1", type: "payment.captured", referenceId: "pay_1", amount: 10990, currency: "MXN", status: "APPROVED", checkoutId: "checkout_1" });
  assert.equal(parseZenithEvent(JSON.stringify({ ...EVENT, type: "payment.failed" }))!.status, "FAILED");
  assert.equal(parseZenithEvent(JSON.stringify({ ...EVENT, type: "payment.refunded" }))!.status, "REFUNDED");
  assert.equal(parseZenithEvent(JSON.stringify({ ...EVENT, type: "checkout.created" }))!.status, "PENDING");
  assert.equal(parseZenithEvent("{nao json"), null);
  assert.equal(parseZenithEvent(JSON.stringify({ id: "x", type: "payment.captured", data: {} })), null, "sem referenceId");
});

function memoryStore(payment = { id: "pay_1", provider: "zenith", amount: 10990, currency: "MXN", providerPaymentId: "checkout_1" as string | null }) {
  const processed = new Set<string>();
  const applied: string[] = [];
  let failNext = false;
  const store: ZenithWebhookStore = {
    findPayment: async (id) => (id === payment.id ? payment : null),
    markProcessed: async (id) => (processed.has(id) ? false : (processed.add(id), true)),
    unmark: async (id) => void processed.delete(id),
    apply: async (_id, status) => {
      if (failNext) {
        failNext = false;
        throw new Error("db");
      }
      applied.push(status);
    },
  };
  return { store, applied, failOnce: () => (failNext = true) };
}

test("webhook repetido: aplicado uma única vez", async () => {
  const { store, applied } = memoryStore();
  const ev = parseZenithEvent(RAW)!;
  assert.equal(await consumeZenithEvent(ev, store), "applied");
  assert.equal(await consumeZenithEvent(ev, store), "duplicate");
  assert.equal(await consumeZenithEvent(ev, store), "duplicate");
  assert.deepEqual(applied, ["APPROVED"]);
});

test("webhook: amount, currency, referenceId e checkout precisam bater com o pedido", async () => {
  const { store, applied } = memoryStore();
  const ev = parseZenithEvent(RAW)!;
  assert.equal(await consumeZenithEvent({ ...ev, amount: 1 }, store), "amount_mismatch");
  assert.equal(await consumeZenithEvent({ ...ev, amount: null }, store), "amount_missing");
  assert.equal(await consumeZenithEvent({ ...ev, currency: "BRL" }, store), "currency_mismatch");
  assert.equal(await consumeZenithEvent({ ...ev, currency: null }, store), "currency_missing");
  assert.equal(await consumeZenithEvent({ ...ev, referenceId: "outro" }, store), "unknown_payment");
  assert.equal(await consumeZenithEvent({ ...ev, checkoutId: "checkout_9" }, store), "checkout_mismatch");
  assert.equal(await consumeZenithEvent({ ...ev, id: "evt_p", status: "PENDING" }, store), "pending_ignored");
  assert.deepEqual(applied, []);
});

test("webhook: falha ao aplicar libera o id para a Zenith reenviar", async () => {
  const { store, applied, failOnce } = memoryStore();
  const ev = parseZenithEvent(RAW)!;
  failOnce();
  await assert.rejects(consumeZenithEvent(ev, store));
  assert.equal(await consumeZenithEvent(ev, store), "applied");
  assert.deepEqual(applied, ["APPROVED"]);
});
