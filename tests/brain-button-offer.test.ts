import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@prisma/client";
import { assistReply, notedCall, publicOfferFormat, type BrainOffer, type BrainReply, type ChatTurn } from "../src/services/ai/brain";

// botão + oferta: canal VIP com só o botão no chat (texto do botão = ctaLabel), vídeo liberado depois do PIX
const BUTTON: BrainOffer = { id: "of_btn", productId: "p_btn", style: "live", button: true, videoId: "v1", ctaLabel: "🔒 FAZER LIGAÇÃO PRIVADA" };
const FOTOS: BrainOffer = { id: "of_fotos", productId: "p_fotos", style: "card" };
const product = (id: string, name: string) => ({ id, name, price: 1990, currency: "BRL", active: true }) as unknown as Product;
const PRODUCTS = new Map([
  ["p_btn", product("p_btn", "Ligação privada")],
  ["p_fotos", product("p_fotos", "Pack de fotos")],
]);
const reply = (): Omit<BrainReply, "usage"> => ({ messages: ["ok"], offer: null, audio: null, image: null, end: false });
const lead = (text: string): ChatTurn => ({ role: "lead", text });
const bot = (text: string): ChatTurn => ({ role: "bot", text });

test("formato público: canal VIP marcado como botão (com vídeo)", () => {
  assert.deepEqual(publicOfferFormat(BUTTON), { style: "live", vip: {}, hasVideo: true, vipButton: true });
  assert.deepEqual(publicOfferFormat({ ...BUTTON, button: undefined }), { style: "live", vip: {}, hasVideo: true });
});

test("sem chamada que toca, o botão é a chamada: pedido de ligação e interesse mostram o botão", () => {
  assert.equal(assistReply(reply(), [lead("oi"), bot("oi"), lead("me liga")], [BUTTON, FOTOS], PRODUCTS, [], []).offer?.id, "of_btn");
  assert.equal(assistReply(reply(), [lead("oi"), bot("oi"), lead("nossa, que linda")], [BUTTON, FOTOS], PRODUCTS, [], []).offer?.id, "of_btn");
  assert.equal(notedCall(["[liguei pra ele]"], [BUTTON, FOTOS], [], "").offer?.id, "of_btn");
});

test("com chamada que toca no cérebro, ela continua sendo a principal", () => {
  const CALL: BrainOffer = { id: "of_call", productId: "p_btn", style: "call", videoId: "v2" };
  assert.equal(assistReply(reply(), [lead("oi"), bot("oi"), lead("me liga")], [BUTTON, CALL], PRODUCTS, [], []).offer?.id, "of_call");
});
