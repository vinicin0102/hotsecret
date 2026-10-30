import { test } from "node:test";
import assert from "node:assert/strict";
import { comboItems, publicOfferFormat, type BrainOffer } from "../src/services/ai/brain";
import { whatsappLinkForOffer } from "../src/lib/whatsapp";
import { brainSchema } from "../src/lib/validation";
import { toTurns } from "../src/services/ai/history";

// Combo do Cérebro: o dono monta o que o mesmo PIX libera (WhatsApp pessoal, chamada de vídeo, Grupo VIP)
const WA: BrainOffer = {
  id: "of_wa",
  productId: "p_wa",
  style: "combo",
  whatsapp: { phone: "+55 11 98765-4321", message: "Oi, vim do chat" },
  vip: { title: "Meu WhatsApp 🤫" },
};

test("formato público: só WhatsApp, sem o número", () => {
  const f = publicOfferFormat(WA);
  assert.deepEqual(f, { style: "live", vip: { title: "Meu WhatsApp 🤫" }, combo: { whatsapp: true } });
  assert.ok(!JSON.stringify(f).includes("98765"));
});

test("formato público: WhatsApp + chamada + Grupo VIP não leva ids nem número", () => {
  const f = publicOfferFormat({ ...WA, videoId: "v1", vipGroupId: "g1" });
  assert.deepEqual(f, { style: "live", vip: { title: "Meu WhatsApp 🤫" }, combo: { whatsapp: true, vip: true }, hasVideo: true });
  assert.ok(!/v1|g1|98765/.test(JSON.stringify(f)));
});

test("formato público: combo sem WhatsApp (chamada + Grupo VIP)", () => {
  const f = publicOfferFormat({ id: "c", productId: "p", style: "combo", videoId: "v1", vipGroupId: "g1" });
  assert.deepEqual(f, { style: "live", vip: {}, combo: { vip: true }, hasVideo: true });
});

test("o que o combo libera, como a IA lê", () => {
  assert.equal(comboItems({ ...WA, videoId: "v1", vipGroupId: "g1" }), "seu WhatsApp pessoal + chamada de vídeo com você + acesso ao seu Grupo VIP");
  assert.equal(comboItems({ videoId: "v1" }), "chamada de vídeo com você");
});

test("entrega: link do combo do produto pago (só com número válido)", () => {
  const offers = [
    { id: "a", productId: "p_wa", style: "card" },
    { id: "b", productId: "p_wa", style: "combo", whatsapp: { phone: "123" } },
    WA,
  ];
  assert.equal(whatsappLinkForOffer(offers, "p_wa"), "https://wa.me/5511987654321?text=Oi%2C%20vim%20do%20chat");
  assert.equal(whatsappLinkForOffer(offers, "p_outro"), null);
});

test("validação: WhatsApp marcado exige número; combo precisa de pelo menos um item", () => {
  const base = { name: "Júlia" };
  assert.ok(brainSchema.safeParse({ ...base, offers: [WA] }).success);
  assert.ok(!brainSchema.safeParse({ ...base, offers: [{ ...WA, whatsapp: { phone: "98765" } }] }).success);
  assert.ok(!brainSchema.safeParse({ ...base, offers: [{ ...WA, whatsapp: undefined }] }).success);
  assert.ok(brainSchema.safeParse({ ...base, offers: [{ ...WA, whatsapp: undefined, vipGroupId: "g1" }] }).success);
  assert.ok(brainSchema.safeParse({ ...base, offers: [{ ...WA, whatsapp: undefined, videoId: "v1" }] }).success);
});

test("histórico: a IA sabe o que o combo mostrou", () => {
  const turns = toTurns([
    { sender: "bot", type: "offer", content: { style: "live", combo: { whatsapp: true, vip: true }, hasVideo: true, name: "Combo", price: 4990, currency: "BRL", aiOfferId: "of_wa" } },
  ] as never);
  assert.match(turns[0].text, /combo \(WhatsApp pessoal, número borrado até o PIX \+ chamada de vídeo \+ Grupo VIP\)/);
  assert.match(turns[0].text, /of_wa/);
});
