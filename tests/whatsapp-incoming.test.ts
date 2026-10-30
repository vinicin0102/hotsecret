import { test } from "node:test";
import assert from "node:assert/strict";
import { incomingText, parseEvolutionWebhook, typingDelay } from "../src/services/whatsapp/incoming";
import { paymentMessages } from "../src/services/whatsapp/bot";

const up = (data: unknown, event = "messages.upsert") => ({ event, instance: "hotsecret", data });
const key = (remoteJid: string, extra: Record<string, unknown> = {}) => ({ remoteJid, fromMe: false, id: "ABC123", ...extra });

test("texto simples e texto com link (extendedTextMessage)", () => {
  const [a] = parseEvolutionWebhook(up({ key: key("5511987654321@s.whatsapp.net"), pushName: "Carlos", message: { conversation: "oi linda" } }));
  assert.deepEqual(a, { waId: "ABC123", jid: "5511987654321@s.whatsapp.net", phone: "5511987654321", fromMe: false, name: "Carlos", kind: "text", text: "oi linda" });
  const [b] = parseEvolutionWebhook(up({ key: key("5511987654321@s.whatsapp.net"), message: { extendedTextMessage: { text: "olha https://x.com" } } }));
  assert.equal(b.text, "olha https://x.com");
});

test("evento em maiúsculas, lista de mensagens e mensagem temporária", () => {
  const list = parseEvolutionWebhook(
    up(
      [
        { key: key("5511900000001@s.whatsapp.net", { id: "1" }), message: { ephemeralMessage: { message: { conversation: "um" } } } },
        { key: key("5511900000002@s.whatsapp.net", { id: "2" }), message: { conversation: "dois" } },
      ],
      "MESSAGES_UPSERT",
    ),
  );
  assert.deepEqual(list.map((m) => m.text), ["um", "dois"]);
});

test("endereço @lid: o número vem do campo alternativo; sem ele, fica sem número", () => {
  const [a] = parseEvolutionWebhook(up({ key: key("123456789012345@lid", { remoteJidAlt: "5511987654321@s.whatsapp.net" }), message: { conversation: "oi" } }));
  assert.equal(a.jid, "123456789012345@lid");
  assert.equal(a.phone, "5511987654321");
  const [b] = parseEvolutionWebhook(up({ key: key("123456789012345@lid"), message: { conversation: "oi" } }));
  assert.equal(b.phone, null);
});

test("ignora grupos, status, outros eventos e reações", () => {
  assert.equal(parseEvolutionWebhook(up({ key: key("120363@g.us"), message: { conversation: "oi grupo" } })).length, 0);
  assert.equal(parseEvolutionWebhook(up({ key: key("status@broadcast"), message: { conversation: "status" } })).length, 0);
  assert.equal(parseEvolutionWebhook(up({ key: key("5511987654321@s.whatsapp.net"), message: { conversation: "oi" } }, "connection.update")).length, 0);
  assert.equal(parseEvolutionWebhook(up({ key: key("5511987654321@s.whatsapp.net"), message: { reactionMessage: { text: "❤️" } } })).length, 0);
  assert.equal(parseEvolutionWebhook(null).length, 0);
});

test("mensagem enviada pelo próprio número (fromMe) e mídias viram anotação para a IA", () => {
  const [mine] = parseEvolutionWebhook(up({ key: key("5511987654321@s.whatsapp.net", { fromMe: true }), message: { conversation: "oi, sou eu" } }));
  assert.equal(mine.fromMe, true);
  const [audio] = parseEvolutionWebhook(up({ key: key("5511987654321@s.whatsapp.net"), message: { audioMessage: { seconds: 4 } } }));
  assert.equal(audio.kind, "audio");
  assert.match(incomingText(audio), /áudio/);
  const [photo] = parseEvolutionWebhook(up({ key: key("5511987654321@s.whatsapp.net"), message: { imageMessage: { caption: "e aí?" } } }));
  assert.equal(incomingText(photo), "[enviou uma foto] e aí?");
});

test("tempo digitando cresce com o texto e tem teto", () => {
  assert.ok(typingDelay("oi") < typingDelay("uma mensagem bem mais comprida que a outra"));
  assert.equal(typingDelay("x".repeat(500)), 4500);
});

test("pagamento: PIX copia e cola sozinho numa mensagem; sem cobrança, aviso", () => {
  const pix = paymentMessages("Ligação privada", "R$ 29,90", { pixQrCode: "000201PIX", redirectUrl: null, nextAction: null }, false);
  assert.equal(pix.length, 2);
  assert.match(pix[0], /Ligação privada — R\$ 29,90/);
  assert.equal(pix[1], "000201PIX");
  const link = paymentMessages("X", "$99", { pixQrCode: null, redirectUrl: "https://pay.example/x", nextAction: null }, true);
  assert.equal(link[1], "https://pay.example/x");
  assert.match(paymentMessages("X", "R$ 1", null, false)[0], /indisponível/);
});
