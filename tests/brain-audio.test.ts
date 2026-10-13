import { test } from "node:test";
import assert from "node:assert/strict";
import { afterCallAudio, assistReply, matchAudio, type BrainAudio, type BrainReply, type BrainVoiceCall, type ChatTurn } from "../src/services/ai/brain";

// os dois áudios do print do dono
const AFTER: BrainAudio = { id: "au_after", url: "https://cdn.example/apos.mp3", when: "Logo após ligar" };
const SAFE: BrainAudio = { id: "au_safe", url: "https://cdn.example/seguro.mp3", when: 'quando pergutarem: " se é seguro", ou "se é golpe"' };
const AUDIOS = [AFTER, SAFE];
const VOICE: BrainVoiceCall = { id: "vc_1", url: "https://cdn.example/voz.mp3" };
const reply = (audio: BrainAudio | null = null): Omit<BrainReply, "usage"> => ({ messages: ["ok"], offer: null, audio, image: null, end: false });
const run = (history: ChatTurn[], audio: BrainAudio | null = null) => assistReply(reply(audio), history, [], new Map(), AUDIOS, [], [VOICE]);
const lead = (text: string): ChatTurn => ({ role: "lead", text });

test("perguntou se é seguro / golpe → manda o áudio da segurança", () => {
  for (const q of ["isso é golpe?", "é seguro?", "é seguro mesmo amor?", "nao é golpe né", "é confiável?", "parece fake", "como sei que nao é golpe", "¿es seguro?", "es una estafa?"]) {
    assert.equal(run([lead("oi"), lead(q)]).audio?.id, "au_safe", q);
  }
});

test("conversa comum não dispara o áudio da segurança", () => {
  for (const q of ["oi amor", "quero ver você", "quanto custa?", "de verdade?", "pode me ligar"]) {
    assert.equal(run([lead("oi"), lead(q)]).audio?.id === "au_safe", false, q);
  }
});

test("'logo após ligar' não sai antes da ligação, nem se a IA escolher", () => {
  assert.equal(run([lead("pode me ligar")]).audio, null);
  assert.equal(run([lead("me liga agora")], AFTER).audio, null);
});

test("áudio já enviado não repete", () => {
  const past: ChatTurn[] = [lead("é golpe?"), { role: "bot", text: '[enviou um áudio (audio_id "au_safe")]' }, lead("é seguro mesmo?")];
  assert.equal(run(past).audio, null);
  assert.equal(run(past, SAFE).audio, null);
});

test("fim da ligação de voz: acha o áudio de 'logo após ligar' (uma vez)", () => {
  assert.equal(afterCallAudio(AUDIOS, "")?.id, "au_after");
  assert.equal(afterCallAudio(AUDIOS, 'audio_id "au_after"'), null);
  for (const w of ["depois da ligação", "assim que terminar a ligação", "após a chamada", "después de la llamada", "logo depois de desligar"]) {
    assert.ok(afterCallAudio([{ id: "x", url: "u", when: w }], ""), w);
  }
  assert.equal(afterCallAudio([{ id: "x", url: "u", when: "quando pedir para ligar" }], ""), null);
});

test("matchAudio: frase entre aspas basta", () => {
  const a: BrainAudio = { id: "a1", url: "u", when: 'quando falarem "to sem dinheiro"' };
  assert.equal(matchAudio([a], "amor to sem dinheiro agora", "")?.id, "a1");
  assert.equal(matchAudio([a], "oi tudo bem", ""), null);
});
