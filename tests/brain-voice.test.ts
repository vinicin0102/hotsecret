import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@prisma/client";
import { assistReply, type BrainOffer, type BrainReply, type BrainVoiceCall, type ChatTurn } from "../src/services/ai/brain";

// cérebro argentino: ligação de voz + chamada de vídeo (oferta) + pack
const VOICE: BrainVoiceCall = { id: "vc_1", url: "https://cdn.example/voz.mp3", offerId: "of_call" };
const CALL: BrainOffer = { id: "of_call", productId: "p_call", style: "call", videoId: "v1" };
const FOTOS: BrainOffer = { id: "of_fotos", productId: "p_fotos", style: "card" };
const OFFERS = [CALL, FOTOS];
const product = (id: string, name: string) => ({ id, name, price: 1999000, currency: "ARS", active: true }) as unknown as Product;
const PRODUCTS = new Map([
  ["p_call", product("p_call", "Videollamada en vivo conmigo")],
  ["p_fotos", product("p_fotos", "Pack de fotos")],
]);

const reply = (offer?: BrainOffer): Omit<BrainReply, "usage"> => ({
  messages: ["ok"],
  offer: offer ? { ...offer, product: PRODUCTS.get(offer.productId)! } : null,
  audio: null,
  image: null,
  end: false,
});
const run = (history: ChatTurn[], offer?: BrainOffer) => assistReply(reply(offer), history, OFFERS, PRODUCTS, [], [], [VOICE]);
const lead = (text: string): ChatTurn => ({ role: "lead", text });
const bot = (text: string): ChatTurn => ({ role: "bot", text });

test("convite em espanhol argentino aceito → a ligação de voz toca", () => {
  for (const ask of ["¿Te puedo llamar un ratito? 😏", "¿querés que te llame?", "dejame hacerte una llamadita", "¿puedo llamarte?"]) {
    for (const yes of ["dale", "sí", "sisi", "de una", "obvio, llamame", "bueno"]) {
      const out = run([lead("hola"), bot("hola lindo"), lead("todo bien"), bot(ask), lead(yes)]);
      assert.equal(out.voiceCall?.id, "vc_1", `${ask} → ${yes}`);
    }
  }
});

test("o lead pede para ligar → toca a ligação de voz (e não a chamada de vídeo junto)", () => {
  const out = run([lead("hola"), bot("hola"), lead("llamame")], CALL);
  assert.equal(out.voiceCall?.id, "vc_1");
  assert.equal(out.offer, null);
});

test("interesse → liga por voz primeiro; depois da ligação, a chamada de vídeo volta a valer", () => {
  const h = [lead("hola"), bot("hola guapo"), lead("que hermosa sos, me encantás")];
  assert.equal(run(h).voiceCall?.id, "vc_1");
  const after = [...h, bot("[ligou para o lead (ligação de voz)]"), lead("[atendeu a ligação de voz e ouviu 40s da sua fala]"), bot("¿te gustó?"), lead("me encantas, sos re linda")];
  const out = run(after);
  assert.equal(out.voiceCall ?? null, null, "uma por conversa");
  assert.equal(out.offer?.id, "of_call");
});

test("sem ligar: primeira mensagem, pedido de produto, recusa e 'me llamo ...'", () => {
  assert.equal(run([lead("que linda")]).voiceCall ?? null, null, "primeira mensagem");
  assert.equal(run([lead("hola"), bot("hola"), lead("me encanta, cuanto sale el pack de fotos?")]).voiceCall ?? null, null, "pediu o pack");
  assert.equal(run([lead("hola"), bot("¿te llamo?"), lead("no, ahora no")]).voiceCall ?? null, null, "recusou o convite");
  assert.equal(run([lead("hola"), bot("me llamo Sofi, ¿y vos?"), lead("si")]).voiceCall ?? null, null, "apresentação não é convite");
  assert.equal(run([lead("hola"), bot("hola"), lead("hacemos videollamada?")], CALL).voiceCall ?? null, null, "pediu vídeo: vai a chamada de vídeo");
  const declined = [lead("hola"), bot("hola"), lead("me encantas"), bot("[ligou para o lead (ligação de voz)]"), lead("[recusou a ligação de voz]"), bot("ok"), lead("sos hermosa")];
  assert.equal(run(declined).voiceCall ?? null, null, "recusou a ligação");
});

test("recusou a ligação de voz: a chamada de vídeo não toca logo em seguida (volta depois de 4 mensagens)", () => {
  const base = [lead("hola"), bot("hola"), lead("llamame"), bot("[ligou para o lead (ligação de voz)]"), lead("[recusou a ligação de voz]")];
  assert.equal(run([...base, lead("jaja ok")], CALL).offer, null, "nem se a IA escolher");
  assert.equal(run([...base, lead("sos hermosa")]).offer, null);
  const later = [...base, lead("a"), bot("b"), lead("c"), bot("d"), lead("e"), bot("f"), lead("me encantas")];
  assert.equal(run(later).offer?.id, "of_call");
  assert.equal(run([...base, lead("hacemos videollamada?")], CALL).offer?.id, "of_call", "se ele pedir vídeo, vai");
});
