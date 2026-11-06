import { test } from "node:test";
import assert from "node:assert/strict";
import { afterCallAudio, aiChoosableAudios, sentAudioIdsOf, withAudioTriggers, type BrainAudio, type BrainReply, type ChatTurn } from "../src/services/ai/brain";

type R = Pick<BrainReply, "audio" | "offer">;

const WELCOME: BrainAudio = { id: "au_oi", url: "u1", trigger: "reply", replyNumber: 1 };
const THIRD: BrainAudio = { id: "au_3", url: "u3", trigger: "reply", replyNumber: 3 };
const SAFE: BrainAudio = { id: "au_safe", url: "u2", trigger: "keywords", keywords: "é golpe, é seguro, confiável" };
const OFFER: BrainAudio = { id: "au_of", url: "u4", trigger: "offer", offerId: "of_vip" };
const BOUGHT: BrainAudio = { id: "au_buy", url: "u5", trigger: "afterPurchase" };
const CALL: BrainAudio = { id: "au_call", url: "u6", trigger: "afterCall" };
const FREE: BrainAudio = { id: "au_free", url: "u7", when: "quando ele elogiar" };
const brain = (audios: BrainAudio[]) => ({ audios }) as never;
const lead = (text: string): ChatTurn => ({ role: "lead", text });
const reply = (extra: Record<string, unknown> = {}) => ({ messages: ["oi"], audio: null, offer: null, ...extra }) as unknown as R;
const run = (audios: BrainAudio[], opts: { history?: ChatTurn[]; replyNumber?: number; offer?: string; bought?: string[]; sent?: string[] } = {}) =>
  withAudioTriggers(reply(opts.offer ? { offer: { id: opts.offer } } : {}), {
    brain: brain(audios),
    history: opts.history ?? [lead("oi")],
    replyNumber: opts.replyNumber,
    boughtProductIds: opts.bought,
    sentAudioIds: opts.sent,
  }).audio?.id ?? null;

test("na resposta nº X: sai exatamente nela, e não antes", () => {
  assert.equal(run([WELCOME], { replyNumber: 1 }), "au_oi");
  assert.equal(run([THIRD], { replyNumber: 2 }), null);
  assert.equal(run([THIRD], { replyNumber: 3 }), "au_3");
});

test("na resposta nº X: se ficou para trás, sai na seguinte — mas nunca repete", () => {
  assert.equal(run([THIRD], { replyNumber: 4 }), "au_3");
  assert.equal(run([THIRD], { replyNumber: 5, sent: ["au_3"] }), null);
  assert.equal(run([THIRD], { replyNumber: 5, history: [lead("oi"), { role: "bot", text: '[enviou um áudio (audio_id "au_3")]' }] }), null);
});

test("quando o lead falar: qualquer uma das frases, sem acento e sem maiúscula", () => {
  assert.equal(run([SAFE], { history: [lead("isso E GOLPE?")] }), "au_safe");
  assert.equal(run([SAFE], { history: [lead("é confiavel mesmo?")] }), "au_safe");
  assert.equal(run([SAFE], { history: [lead("quanto custa?")] }), null);
});

test("junto com a oferta: só com a oferta escolhida (ou qualquer uma)", () => {
  assert.equal(run([OFFER], { offer: "of_vip" }), "au_of");
  assert.equal(run([OFFER], { offer: "of_outro" }), null);
  assert.equal(run([{ ...OFFER, offerId: undefined }], { offer: "of_outro" }), "au_of");
  assert.equal(run([OFFER]), null);
});

test("depois da compra: só quem comprou", () => {
  assert.equal(run([BOUGHT]), null);
  assert.equal(run([BOUGHT], { bought: ["p1"] }), "au_buy");
});

test("prioridade: frase do lead vence a resposta nº X (que fica para a próxima)", () => {
  assert.equal(run([WELCOME, SAFE], { replyNumber: 1, history: [lead("é golpe?")] }), "au_safe");
  assert.equal(run([WELCOME, SAFE], { replyNumber: 2, history: [lead("ok")], sent: ["au_safe"] }), "au_oi");
});

test("regra exata substitui o áudio que a IA escolheu", () => {
  const r = withAudioTriggers({ audio: FREE, offer: null } as R, { brain: brain([WELCOME, FREE]), history: [lead("oi")], replyNumber: 1 });
  assert.equal(r.audio?.id, "au_oi");
});

test("a IA só escolhe os áudios 'A IA decide'; o de após a ligação sai quando a ligação termina", () => {
  assert.deepEqual(aiChoosableAudios([WELCOME, SAFE, FREE, CALL]).map((a) => a.id), ["au_free"]);
  assert.equal(run([CALL], { replyNumber: 1 }), null);
  assert.equal(afterCallAudio([FREE, CALL], "")?.id, "au_call");
  assert.equal(afterCallAudio([FREE, CALL], 'audio_id "au_call"'), null);
});

test("áudios já enviados vêm das mensagens gravadas", () => {
  assert.deepEqual(sentAudioIdsOf([{ type: "audio", content: { aiAudioId: "au_3" } }, { type: "text", content: { text: "oi" } }, { type: "audio", content: { url: "x" } }]), ["au_3"]);
});
