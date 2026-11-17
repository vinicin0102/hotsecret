import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@prisma/client";
import { assistReply, brainImages, mediaLabel, warmupState, type BrainMedia, type BrainOffer, type BrainReply, type ChatTurn } from "../src/services/ai/brain";

// conversa longa: 8 mensagens do lead antes da 1ª oferta, com amostras saindo aos poucos
const CALL: BrainOffer = { id: "of_call", productId: "p_call", style: "call", videoId: "v1" };
const FOTOS: BrainOffer = { id: "of_fotos", productId: "p_fotos", style: "card" };
const OFFERS = [CALL, FOTOS];
const product = (id: string, name: string) => ({ id, name, price: 1990, currency: "BRL", active: true }) as unknown as Product;
const PRODUCTS = new Map([
  ["p_call", product("p_call", "Chamada de vídeo comigo")],
  ["p_fotos", product("p_fotos", "Pack de fotos")],
]);
const IMAGES: BrainMedia[] = [
  { id: "im_1", url: "https://x/1.jpg", kind: "image" },
  { id: "im_2", url: "https://x/2.mp4", kind: "video" },
  { id: "im_3", url: "https://x/3.mp4", kind: "video", blur: true },
];
const BRAIN = { warmupMessages: 8 };
const lead = (text: string): ChatTurn => ({ role: "lead", text });
const bot = (text: string): ChatTurn => ({ role: "bot", text });
const reply = (offer?: BrainOffer): Omit<BrainReply, "usage"> => ({
  messages: ["ok"],
  offer: offer ? { ...offer, product: PRODUCTS.get(offer.productId)! } : null,
  audio: null,
  image: null,
  end: false,
});
const run = (history: ChatTurn[], offer?: BrainOffer) =>
  assistReply(reply(offer), history, OFFERS, PRODUCTS, [], IMAGES, [], undefined, warmupState(BRAIN, history, IMAGES));

test("aquecendo: elogio não liga (sem a conversa longa, ligaria)", () => {
  const h = [lead("oi"), bot("oii"), lead("que linda você é")];
  assert.equal(run(h).offer, null);
  assert.equal(assistReply(reply(), h, OFFERS, PRODUCTS, [], IMAGES).offer?.id, "of_call");
});

test("aquecendo: a IA mandou a oferta por conta própria → segura", () => {
  assert.equal(run([lead("oi"), bot("oii"), lead("tudo bem e vc?")], CALL).offer, null);
});

test("aquecendo: o lead perguntou o preço ou pediu pra ligar → atende na hora", () => {
  assert.equal(run([lead("oi"), bot("oii"), lead("quanto custa o pack de fotos?")]).offer?.id, "of_fotos");
  assert.equal(run([lead("oi"), bot("oii"), lead("me liga agora")]).offer?.id, "of_call");
});

test("depois de 8 mensagens: volta a ligar quando há interesse", () => {
  const h: ChatTurn[] = [];
  for (let i = 0; i < 7; i++) h.push(lead(`msg ${i}`), bot("hm"));
  h.push(lead("nossa que delicia"));
  assert.equal(warmupState(BRAIN, h, IMAGES).left, 0);
  assert.equal(run(h).offer?.id, "of_call");
});

test("amostras: 3 mensagens sem nenhuma → o sistema manda a próxima da lista, sem repetir", () => {
  const h = [lead("oi"), bot("oi"), lead("de onde vc é"), bot("sp"), lead("legal")];
  assert.equal(run(h).image?.id, "im_1");
  const h2 = [...h, bot('[enviou uma foto (image_id "im_1")]'), lead("hm"), bot("e vc?"), lead("rj")];
  assert.equal(run(h2).image, null); // só 2 desde a última
  assert.equal(run([...h2, bot("rj é lindo"), lead("é sim")]).image?.id, "im_2");
});

test("vídeo borrado: marcado na prévia e descrito para a IA", () => {
  const imgs = brainImages({ images: [{ id: "a", url: "https://x/a.mp4", blur: true }, { id: "b", url: "https://x/b.jpg", blur: true }] as never });
  assert.equal(imgs[0].blur, true);
  assert.equal(imgs[1].blur, false); // foto não fica borrada
  assert.match(mediaLabel(imgs[0]), /BORRADO/);
});

test("conversa longa desligada ou já comprou: nada muda", () => {
  assert.equal(warmupState({ warmupMessages: 0 }, [lead("oi")], IMAGES).left, 0);
  assert.equal(warmupState(BRAIN, [lead("oi")], IMAGES, true).left, 0);
});
