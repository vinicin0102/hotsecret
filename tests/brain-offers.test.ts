import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@prisma/client";
import { assistReply, type BrainOffer, type BrainReply, type ChatTurn } from "../src/services/ai/brain";

// cérebro com chamada de vídeo (oferta principal) + dois packs
// sem "Quando oferecer": vale o padrão (liga sempre que houver interesse)
const CALL: BrainOffer = { id: "of_call", productId: "p_call", style: "call", videoId: "v1" };
const FOTOS: BrainOffer = { id: "of_fotos", productId: "p_fotos", style: "card" };
const TAROT: BrainOffer = { id: "of_tarot", productId: "p_tarot", style: "tarot" };
const OFFERS = [CALL, FOTOS, TAROT];
const product = (id: string, name: string) => ({ id, name, price: 1990, currency: "MXN", active: true }) as unknown as Product;
const PRODUCTS = new Map([
  ["p_call", product("p_call", "Videollamada en vivo conmigo")],
  ["p_fotos", product("p_fotos", "Pack de fotos")],
  ["p_tarot", product("p_tarot", "Lectura de tarot")],
]);

const reply = (offer?: BrainOffer): Omit<BrainReply, "usage"> => ({
  messages: ["ok"],
  offer: offer ? { ...offer, product: PRODUCTS.get(offer.productId)! } : null,
  audio: null,
  image: null,
  end: false,
});
const run = (history: ChatTurn[], offer?: BrainOffer) => assistReply(reply(offer), history, OFFERS, PRODUCTS, [], []).offer?.id ?? null;
const lead = (text: string): ChatTurn => ({ role: "lead", text });
const bot = (text: string): ChatTurn => ({ role: "bot", text });
const rang = bot('[ligou para o lead (chamada de vídeo) com a oferta Videollamada — $19.90 MXN (offer_id "of_call")]');

test("oferta errada: o lead pediu o tarot e a IA mandou o pack → vai o tarot", () => {
  assert.equal(run([lead("hola"), bot("hola amor"), lead("quiero la lectura de tarot")], FOTOS), "of_tarot");
});

test("não manda a oferta: lead pediu um produto pelo nome e a IA só conversou → oferta sai", () => {
  assert.equal(run([lead("hola"), bot("hola"), lead("cuanto cuesta el pack de fotos?")]), "of_fotos");
});

test("ligar sempre que houver interesse (e ele não pediu outro produto)", () => {
  assert.equal(run([lead("hola"), bot("hola guapo"), lead("que hermosa eres, me encantas")]), "of_call");
  assert.equal(run([lead("oi"), bot("oi amor"), lead("nossa, que linda")]), "of_call", "também em português");
});

test("cedo demais: primeira mensagem sem pedido não recebe oferta", () => {
  assert.equal(run([lead("hola")], FOTOS), null);
  assert.equal(run([lead("hola")]), null);
  assert.equal(run([lead("cuanto cuesta?")], FOTOS), "of_fotos", "se ele perguntou preço na 1ª, pode");
});

test("demais: a mesma oferta não se repete nas 3 últimas falas, a menos que ele peça", () => {
  const h = [lead("hola"), bot("hola"), lead("me gusta"), bot('[mostrou o card da oferta Pack de fotos — $19.90 MXN (offer_id "of_fotos")]'), lead("jaja que bien")];
  assert.equal(run(h, FOTOS), null);
  assert.equal(run([...h.slice(0, -1), lead("si, quiero comprar el pack de fotos")], FOTOS), "of_fotos");
});

test("recusou a chamada: não liga de novo na hora; depois de 4 mensagens convida outra vez", () => {
  const base = [lead("hola"), bot("hola"), lead("me encantas"), rang, lead("[recusou a chamada de vídeo]")];
  assert.equal(run([...base, lead("que linda")]), null, "logo depois da recusa");
  assert.equal(run([...base, lead("que linda")], CALL), null, "nem se a IA tentar");
  const later = [...base, lead("a"), bot("b"), lead("c"), bot("d"), lead("e"), bot("f"), lead("me encantas mucho")];
  assert.equal(run(later), "of_call", "convida de novo mais tarde");
});

test("recusa clara do lead: nada é empurrado", () => {
  assert.equal(run([lead("hola"), bot("hola"), lead("no gracias")]), null);
});

test("depois da recusa, o downsell que a IA escolheu continua (a anotação do sistema não vira pedido)", () => {
  const SHORT: BrainOffer = { id: "of_short", productId: "p_short", style: "call", videoId: "v2" };
  const products = new Map([...PRODUCTS, ["p_short", product("p_short", "Videollamada 5 min")]]);
  const h = [lead("hola"), bot("hola"), lead("me encantas"), rang, lead("[recusou a chamada de vídeo]")];
  const out = assistReply(reply(SHORT), h, [...OFFERS, SHORT], products, [], []);
  assert.equal(out.offer?.id, "of_short");
});

test("pediu chamada de vídeo e a IA mandou um pack → não manda o pack (vai a chamada)", () => {
  assert.equal(run([lead("hola"), bot("hola"), lead("quiero una videollamada")], FOTOS), "of_call");
  const noCall = assistReply(reply(FOTOS), [lead("oi"), bot("oi"), lead("quero uma chamada de vídeo")], [FOTOS, TAROT], PRODUCTS, [], []);
  assert.equal(noCall.offer, null, "sem chamada no cérebro: nada de pack no lugar");
});

// ---------- os comandos do dono ("Quando oferecer") mandam ----------
const withWhen = (o: BrainOffer, when: string) => ({ ...o, when });
const runWith = (offers: BrainOffer[], history: ChatTurn[], offer?: BrainOffer) =>
  assistReply(reply(offer), history, offers, PRODUCTS, [], []).offer?.id ?? null;

test("dono escreveu quando ligar: interesse sozinho não força a chamada", () => {
  const call = withWhen(CALL, "só depois que ele comprar o pack de fotos");
  assert.equal(runWith([call, FOTOS, TAROT], [lead("hola"), bot("hola"), lead("que hermosa eres, me encantas")]), null);
  // a IA seguiu a ordem e ligou: fica
  assert.equal(runWith([call, FOTOS, TAROT], [lead("hola"), bot("hola"), lead("que hermosa eres")], call), "of_call");
});

test("dono mandou oferecer na primeira mensagem: a IA obedece e a oferta não é cortada", () => {
  const fotos = withWhen(FOTOS, "logo na primeira mensagem, mande o pack");
  assert.equal(runWith([CALL, fotos, TAROT], [lead("hola")], fotos), "of_fotos");
});

test("ordem do dono para o pedido do lead: a oferta da ordem não é trocada pela citada", () => {
  // "quando pedirem tarot, mande primeiro o pack de fotos"
  const fotos = withWhen(FOTOS, "quando pedirem tarot ou lectura, mande primeiro este pack");
  assert.equal(runWith([CALL, fotos, TAROT], [lead("hola"), bot("hola"), lead("quiero la lectura de tarot")], fotos), "of_fotos");
  // sem ordem do dono, continua trocando para o que ele pediu
  assert.equal(runWith([CALL, FOTOS, TAROT], [lead("hola"), bot("hola"), lead("quiero la lectura de tarot")], FOTOS), "of_tarot");
});

test("pedir prévia não é pedir para comprar: a única oferta não é empurrada", () => {
  const only = [FOTOS];
  const one = (text: string) => assistReply(reply(), [lead("hola"), bot("hola"), lead(text)], only, PRODUCTS, [], []).offer?.id ?? null;
  assert.equal(one("me manda uma prévia"), null);
  assert.equal(one("mandame un adelanto"), null);
  assert.equal(one("quero comprar"), "of_fotos");
});
