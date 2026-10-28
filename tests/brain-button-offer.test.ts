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

// ---------- esteira: comprou, assistiu, voltou → a próxima ----------
import { CALL_ENDED_NOTE } from "../src/services/ai/brain";
const BUTTON2: BrainOffer = { id: "of_btn2", productId: "p_btn2", style: "live", button: true, videoId: "v2", ctaLabel: "LIGAÇÃO DE 20 MIN" };
const P2 = new Map([...PRODUCTS, ["p_btn2", product("p_btn2", "Ligação privada 20 min")]]);

test("voltou da chamada que comprou: a IA oferece a próxima da esteira (as compradas já saíram da lista)", () => {
  const h = [lead("oi"), bot("oi amor"), lead("me liga"), bot('[mostrou o botão "FAZER LIGAÇÃO PRIVADA" (o lead toca para ver a oferta) da oferta Ligação privada (offer_id "of_btn")]'), lead(CALL_ENDED_NOTE)];
  // a 1ª já foi comprada: a lista que chega na IA começa pela 2ª
  assert.equal(assistReply(reply(), h, [BUTTON2, FOTOS], P2, [], []).offer?.id, "of_btn2");
  // a IA escolheu sozinha: fica a escolha dela
  const own = { ...reply(), offer: { ...FOTOS, product: P2.get("p_fotos")! } };
  assert.equal(assistReply(own, h, [BUTTON2, FOTOS], P2, [], []).offer?.id, "of_fotos");
  // acabou a esteira: nada é empurrado
  assert.equal(assistReply(reply(), h, [], P2, [], []).offer, null);
});

test("depois de comprar a 1ª, pedir para ligar mostra o botão da 2ª", () => {
  assert.equal(assistReply(reply(), [lead("oi"), bot("oi"), lead("me liga de novo")], [BUTTON2, FOTOS], P2, [], []).offer?.id, "of_btn2");
});
