import { test } from "node:test";
import assert from "node:assert/strict";
import { assistReply, brainImages, mediaLabel, type BrainMedia } from "../src/services/ai/brain";

const vip: BrainMedia = { id: "vg1", url: "", kind: "vip", groupId: "g1", when: "quando explicar o VIP" };
const foto: BrainMedia = { id: "im1", url: "/a.jpg", kind: "image", when: "lingerie" };
const base = { messages: ["claro amor"], offer: null, audio: null, image: null, end: false };

test("prévia do Grupo VIP é uma prévia válida (sem arquivo, com grupo)", () => {
  const list = brainImages({ images: [vip, { id: "x", url: "", kind: "vip" }, foto, { id: "y", url: "" }] as never });
  assert.deepEqual(list.map((m) => [m.id, m.kind]), [["vg1", "vip"], ["im1", "image"]]);
  assert.match(mediaLabel(vip), /Grupo VIP/);
  assert.equal(mediaLabel(foto), "foto");
});

test("perguntou o que tem no VIP: manda o card (uma vez só)", () => {
  for (const q of ["o que tem no seu vip?", "e o que eu ganho?", "como funciona o grupo?", "¿qué incluye?"]) {
    const r = assistReply(base, [{ role: "lead", text: q }], [], new Map(), [], [foto, vip]);
    assert.equal(r.image?.id, "vg1", q);
  }
  const sent = assistReply(base, [{ role: "bot", text: '[mandou a prévia do Grupo VIP "Bianca" (image_id "vg1")]' }, { role: "lead", text: "o que tem no vip?" }], [], new Map(), [], [foto, vip]);
  assert.equal(sent.image, null);
});

test("pediu prévia/foto: manda a foto antes do card do VIP", () => {
  const r = assistReply(base, [{ role: "lead", text: "manda uma prévia" }], [], new Map(), [], [vip, foto]);
  assert.equal(r.image?.id, "im1");
});
