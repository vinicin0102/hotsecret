import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tiktokEvent, tiktokUserOf } from "../src/services/tiktok-events";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

test("TikTok: e-mail minúsculo e telefone E.164 (com DDI do país) em hash; clique e cookie sem hash", () => {
  const u = tiktokUserOf({ id: "lead1", email: " Ana@Mail.com ", phone: "(11) 98888-7777", country: "BR", clientIp: "1.2.3.4", userAgent: "UA", ttclid: "E.C.P.abc123", ttp: "ttpcookie123" });
  assert.equal(u.external_id, sha("lead1"));
  assert.equal(u.email, sha("ana@mail.com"));
  assert.equal(u.phone, sha("+5511988887777"));
  assert.equal(u.ip, "1.2.3.4");
  assert.equal(u.ttclid, "E.C.P.abc123");
  assert.equal(u.ttp, "ttpcookie123");
});

test("TikTok: telefone ou e-mail inválido fica de fora", () => {
  const u = tiktokUserOf({ id: "l", email: "sem-arroba", phone: "123", country: "BR", clientIp: "unknown" });
  assert.equal(u.email, undefined);
  assert.equal(u.phone, undefined);
  assert.equal(u.ip, undefined);
});

test("TikTok: venda com valor em reais, produto e o mesmo event_id do navegador", () => {
  const e = tiktokEvent({ name: "CompletePayment", eventId: "pay_1", lead: { id: "l" }, product: { id: "prod1", name: "VIP", price: 2990, currency: "BRL" }, url: "https://x/f/a" });
  assert.equal(e.event, "CompletePayment");
  assert.equal(e.event_id, "pay_1");
  assert.deepEqual(e.properties, { currency: "BRL", value: 29.9, content_type: "product", contents: [{ content_id: "prod1", content_name: "VIP", price: 29.9, quantity: 1 }] });
  assert.deepEqual(e.page, { url: "https://x/f/a" });
});
