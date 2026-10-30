import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUazapiWebhook, parseWebhook } from "../src/services/whatsapp/incoming";
import { missingWaEnv, waConfig } from "../src/services/whatsapp/client";

const uaz = (message: Record<string, unknown>, chat: Record<string, unknown> = {}, EventType = "messages") => ({
  BaseUrl: "https://hot.uazapi.com",
  EventType,
  owner: "5511900000000",
  token: "tok",
  chat: { wa_chatid: "5511987654321@s.whatsapp.net", phone: "5511987654321", wa_isGroup: false, ...chat },
  message: { chatid: "5511987654321@s.whatsapp.net", messageid: "3EB0ABC", fromMe: false, isGroup: false, senderName: "Carlos", messageType: "Conversation", type: "text", mediaType: "", wasSentByApi: false, ...message },
});

test("uazapi: texto, nome e número", () => {
  const [m] = parseUazapiWebhook(uaz({ text: "oi linda" }));
  assert.deepEqual(m, { waId: "3EB0ABC", jid: "5511987654321@s.whatsapp.net", phone: "5511987654321", fromMe: false, name: "Carlos", kind: "text", text: "oi linda", byApi: false });
});

test("uazapi: áudio (ptt), foto com legenda, enviada pela API e do próprio número", () => {
  assert.equal(parseUazapiWebhook(uaz({ text: "", mediaType: "ptt", messageType: "AudioMessage", type: "media" }))[0].kind, "audio");
  const [photo] = parseUazapiWebhook(uaz({ text: "e aí?", mediaType: "image", messageType: "ImageMessage", type: "media" }));
  assert.equal(photo.kind, "image");
  assert.equal(photo.text, "e aí?");
  assert.equal(parseUazapiWebhook(uaz({ text: "resposta do bot", fromMe: true, wasSentByApi: true }))[0].byApi, true);
  assert.equal(parseUazapiWebhook(uaz({ text: "oi, sou eu", fromMe: true }))[0].fromMe, true);
});

test("uazapi: ignora grupo, reação, outros eventos; @lid usa o número do remetente", () => {
  assert.equal(parseUazapiWebhook(uaz({ text: "oi grupo", isGroup: true, chatid: "1203@g.us" })).length, 0);
  assert.equal(parseUazapiWebhook(uaz({ text: "❤️", messageType: "ReactionMessage", type: "reaction" })).length, 0);
  assert.equal(parseUazapiWebhook(uaz({ text: "oi" }, {}, "connection")).length, 0);
  const [lid] = parseUazapiWebhook(uaz({ text: "oi", chatid: "123456789012345@lid", sender_pn: "5511911112222@s.whatsapp.net" }, { wa_chatid: "123456789012345@lid", phone: "" }));
  assert.equal(lid.jid, "123456789012345@lid");
  assert.equal(lid.phone, "5511911112222");
});

test("o formato do webhook diz se é uazapi ou Evolution", () => {
  assert.equal(parseWebhook(uaz({ text: "via uazapi" }))[0].text, "via uazapi");
  const evo = { event: "messages.upsert", instance: "hotsecret", data: { key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: false, id: "E1" }, message: { conversation: "via evolution" } } };
  assert.equal(parseWebhook(evo)[0].text, "via evolution");
});

test("qual serviço: *.uazapi.com é uazapi (sem instância); outro endereço é Evolution (com instância)", () => {
  const keep = { ...process.env };
  try {
    delete process.env.WHATSAPP_PROVIDER;
    Object.assign(process.env, { WHATSAPP_API_URL: "https://hot.uazapi.com/", WHATSAPP_API_KEY: "tok" });
    delete process.env.WHATSAPP_INSTANCE;
    assert.deepEqual(waConfig(), { provider: "uazapi", url: "https://hot.uazapi.com", key: "tok", instance: "" });
    assert.deepEqual(missingWaEnv(), []);
    process.env.WHATSAPP_API_URL = "evo.meudominio.com";
    assert.equal(waConfig(), null, "Evolution sem instância");
    assert.deepEqual(missingWaEnv(), ["WHATSAPP_INSTANCE"]);
    process.env.WHATSAPP_INSTANCE = "hotsecret";
    assert.equal(waConfig()?.provider, "evolution");
    assert.equal(waConfig()?.url, "https://evo.meudominio.com");
  } finally {
    for (const k of ["WHATSAPP_API_URL", "WHATSAPP_API_KEY", "WHATSAPP_INSTANCE", "WHATSAPP_PROVIDER"]) {
      if (keep[k] === undefined) delete process.env[k];
      else process.env[k] = keep[k];
    }
  }
});
