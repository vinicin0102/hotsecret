import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isValidCpf } from "../src/lib/cpf";
import { sanitizeText, sanitizeUrl } from "../src/lib/sanitize";
import { parseMoneyToCents } from "../src/lib/format";
import { mercadoPagoProvider, mapMercadoPagoStatus } from "../src/services/payments/mercadopago";
import { graphSchema } from "../src/lib/validation";

test("CPF", () => {
  assert.ok(isValidCpf("529.982.247-25"));
  assert.ok(!isValidCpf("111.111.111-11"));
  assert.ok(!isValidCpf("529.982.247-24"));
});

test("sanitização de texto e URLs", () => {
  assert.equal(sanitizeText("<script>alert(1)</script>oi\u0000"), "alert(1)oi");
  assert.equal(sanitizeUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeUrl("//evil.com/x"), "");
  assert.equal(sanitizeUrl("/hot-secret/api/uploads/a.png"), "/hot-secret/api/uploads/a.png");
  assert.equal(sanitizeUrl("https://ok.com/a"), "https://ok.com/a");
});

test("dinheiro em centavos", () => {
  assert.equal(parseMoneyToCents("9,90"), 990);
  assert.equal(parseMoneyToCents("R$ 1.234,56"), 123456);
  assert.equal(parseMoneyToCents("27.00"), 2700);
});

test("grafo: URLs perigosas são removidas e condições inválidas rejeitadas", () => {
  const g = graphSchema.parse({
    nodes: [
      { id: "start", type: "start", content: {}, position: { x: 0, y: 0 } },
      { id: "l", type: "link", content: { url: "javascript:alert(1)", buttonLabel: "x" }, position: { x: 0, y: 0 } },
    ],
    edges: [{ id: "e", source: "start", target: "l", condition: "default" }],
  });
  assert.equal((g.nodes[1].content as { url: string }).url, "");
  assert.throws(() =>
    graphSchema.parse({ nodes: [], edges: [{ id: "e", source: "a", target: "b", condition: "drop table" }] }),
  );
});

test("webhook Mercado Pago: assinatura x-signature", () => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = "segredo-teste";
  const ts = "1704908010";
  const manifest = `id:123456;request-id:req-1;ts:${ts};`;
  const v1 = createHmac("sha256", "segredo-teste").update(manifest).digest("hex");
  const rawBody = JSON.stringify({ type: "payment", data: { id: "123456" } });
  const ok = mercadoPagoProvider.verifyWebhook({
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-1" },
    query: { "data.id": "123456", type: "payment" },
    rawBody,
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.providerPaymentId, "123456");
  const bad = mercadoPagoProvider.verifyWebhook({
    headers: { "x-signature": `ts=${ts},v1=${"0".repeat(64)}`, "x-request-id": "req-1" },
    query: { "data.id": "123456" },
    rawBody,
  });
  assert.equal(bad.valid, false);
});

test("status Mercado Pago", () => {
  assert.equal(mapMercadoPagoStatus("approved"), "APPROVED");
  assert.equal(mapMercadoPagoStatus("in_process"), "PENDING");
  assert.equal(mapMercadoPagoStatus("rejected"), "FAILED");
  assert.equal(mapMercadoPagoStatus("refunded"), "REFUNDED");
});
