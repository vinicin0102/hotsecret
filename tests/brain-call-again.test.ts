import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@prisma/client";
import { assistReply, notedCall, stripNotes, type BrainOffer, type BrainReply, type BrainVoiceCall, type ChatTurn } from "../src/services/ai/brain";

// o caso do print: o lead pede para ligar de novo e a IA escreve a anotação do histórico em vez de ligar
const CALL: BrainOffer = { id: "of_aojw4arqzl", productId: "p_call", style: "call", videoId: "v1" };
const FOTOS: BrainOffer = { id: "of_fotos", productId: "p_fotos", style: "card" };
const OFFERS = [CALL, FOTOS];
const product = (id: string, name: string) => ({ id, name, price: 999, currency: "BRL", active: true }) as unknown as Product;
const PRODUCTS = new Map([
  ["p_call", product("p_call", "Chamada ao vivo")],
  ["p_fotos", product("p_fotos", "Pack de fotos")],
]);
const VOICE: BrainVoiceCall = { id: "vc_1", url: "https://cdn.example/voz.mp3" };
const NOTE = '[ligou para o lead (chamada de vídeo) com a oferta Chamada ao vivo — R$ 9,99 (offer_id "of_aojw4arqzl")]';
const lead = (text: string): ChatTurn => ({ role: "lead", text });
const bot = (text: string): ChatTurn => ({ role: "bot", text });
const reply = (offer?: BrainOffer): Omit<BrainReply, "usage"> => ({
  messages: ["Atende que eu já apareço pra vc 🔥"],
  offer: offer ? { ...offer, product: PRODUCTS.get(offer.productId)! } : null,
  audio: null,
  image: null,
  end: false,
});

test("a anotação da ligação (longa, com preço e offer_id) sai do balão", () => {
  assert.equal(stripNotes(NOTE), "");
  assert.equal(stripNotes(`Tô indo amor ${NOTE}`), "Tô indo amor");
});

test("a IA escreveu a ligação no balão: vira a ligação de verdade (pela oferta citada)", () => {
  assert.equal(notedCall(["Tô indo amor, prometo 😳", NOTE], OFFERS, [], "").offer?.id, "of_aojw4arqzl");
  // sem o id: a chamada de vídeo do cérebro
  assert.equal(notedCall(["[liguei pra ele de novo]"], OFFERS, [], "").offer?.id, "of_aojw4arqzl");
  // ligação de voz (só se ainda não houve nesta conversa)
  assert.equal(notedCall(["[ligou para o lead (ligação de voz)]"], OFFERS, [VOICE], "").voiceCall?.id, "vc_1");
  assert.equal(notedCall(["[ligou para o lead (ligação de voz)]"], OFFERS, [VOICE], "[ligou para o lead (ligação de voz)]").offer?.id, "of_aojw4arqzl");
  // outras anotações não são ligação
  assert.deepEqual(notedCall(["[prévia do VIP]", "oi"], OFFERS, [VOICE], ""), { offer: null, voiceCall: null });
});

test("pediu para ligar de novo logo depois da chamada: liga (a regra de não repetir não bloqueia o pedido)", () => {
  const h = [lead("oi"), bot("oi amor"), lead("que linda"), bot(NOTE), lead("me liga de novo")];
  assert.equal(assistReply(reply(), h, OFFERS, PRODUCTS, [], []).offer?.id, "of_aojw4arqzl", "a IA só conversou");
  assert.equal(assistReply(reply(CALL), h, OFFERS, PRODUCTS, [], []).offer?.id, "of_aojw4arqzl", "a IA escolheu a chamada");
  assert.equal(assistReply(reply(), [...h.slice(0, -1), lead("liga denovo amor")], OFFERS, PRODUCTS, [], []).offer?.id, "of_aojw4arqzl", "escrito junto");
});

test("pedido de ligação vale mesmo com 'Quando oferecer' escrito pelo dono", () => {
  const call = { ...CALL, when: "depois que ele comprar o pack" };
  const h = [lead("oi"), bot("oi amor"), lead("me liga")];
  assert.equal(assistReply(reply(), h, [call, FOTOS], PRODUCTS, [], []).offer?.id, "of_aojw4arqzl");
});

test("sem pedido de ligação, a chamada que acabou de tocar não se repete sozinha", () => {
  const h = [lead("oi"), bot("oi amor"), lead("que linda"), bot(NOTE), lead("kkk adorei")];
  assert.equal(assistReply(reply(), h, OFFERS, PRODUCTS, [], []).offer, null);
});
