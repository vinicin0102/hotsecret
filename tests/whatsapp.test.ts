import { test } from "node:test";
import assert from "node:assert/strict";
import { publicMarker, whatsappDigits, whatsappLink, whatsappLinkForProduct } from "../src/lib/whatsapp";

test("número: aceita com máscara, recusa curto/longo", () => {
  assert.equal(whatsappDigits("+55 (11) 98765-4321"), "5511987654321");
  assert.equal(whatsappDigits("52 1 55 1234 5678"), "5215512345678");
  assert.equal(whatsappDigits("98765-4321"), null);
  assert.equal(whatsappDigits("1234567890123456"), null);
  assert.equal(whatsappDigits(undefined), null);
});

test("link: wa.me com a mensagem escrita", () => {
  assert.equal(whatsappLink("+55 11 98765-4321"), "https://wa.me/5511987654321");
  assert.equal(whatsappLink("5511987654321", " Oi, vim da chamada 😘 "), "https://wa.me/5511987654321?text=Oi%2C%20vim%20da%20chamada%20%F0%9F%98%98");
  assert.equal(whatsappLink("123", "oi"), null);
});

test("produto: usa o upsell WhatsApp com número válido desse produto", () => {
  const markers = [
    { style: "vip" as const, productId: "p1", whatsapp: { phone: "5511987654321" } },
    { style: "whatsapp" as const, productId: "p2", whatsapp: { phone: "abc" } },
    { style: "whatsapp" as const, productId: "p2", whatsapp: { phone: "5511911112222", message: "oi" } },
  ];
  assert.equal(whatsappLinkForProduct(markers, "p2"), "https://wa.me/5511911112222?text=oi");
  assert.equal(whatsappLinkForProduct(markers, "p1"), null);
  assert.equal(whatsappLinkForProduct(markers, "p3"), null);
});

test("antes de pagar o número não vai para o navegador", () => {
  const m = publicMarker({ id: "m1", style: "whatsapp" as const, productId: "p2", whatsapp: { phone: "5511911112222", message: "oi" } });
  assert.equal("whatsapp" in m, false);
  assert.equal(JSON.stringify(m).includes("5511911112222"), false);
});
