// Mensagens que chegam da Evolution (evento messages.upsert) ou da uazapi (EventType "messages") → formato simples.
// Sem banco: dá para testar isolado.

export interface IncomingMessage {
  /** id da mensagem no WhatsApp (evita processar duas vezes) */
  waId: string;
  /** endereço para responder */
  jid: string;
  /** só os dígitos do número, quando dá para saber */
  phone: string | null;
  fromMe: boolean;
  name: string | null;
  kind: "text" | "image" | "audio" | "video" | "sticker" | "other";
  /** texto digitado (ou a legenda da foto/vídeo) */
  text: string;
  /** enviada pela própria API (eco da resposta do bot) */
  byApi?: boolean;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** tira os invólucros (mensagem temporária, visualização única...) */
function unwrap(message: Obj | null): Obj | null {
  let m = message;
  for (let i = 0; i < 4 && m; i++) {
    const inner =
      obj(obj(m.ephemeralMessage)?.message) ??
      obj(obj(m.viewOnceMessage)?.message) ??
      obj(obj(m.viewOnceMessageV2)?.message) ??
      obj(obj(m.documentWithCaptionMessage)?.message);
    if (!inner) break;
    m = inner;
  }
  return m;
}

const digits = (jid: string) => {
  const d = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
};

function parseOne(data: Obj): IncomingMessage | null {
  const key = obj(data.key);
  const jid = str(key?.remoteJid);
  const waId = str(key?.id);
  if (!jid || !waId) return null;
  // grupos, status e canais ficam de fora: o Cérebro responde só conversas individuais
  if (/@g\.us$|@broadcast$|@newsletter$/.test(jid) || jid === "status@broadcast") return null;
  const m = unwrap(obj(data.message));
  if (!m) return null;
  const text =
    str(m.conversation) ||
    str(obj(m.extendedTextMessage)?.text) ||
    str(obj(m.imageMessage)?.caption) ||
    str(obj(m.videoMessage)?.caption) ||
    str(obj(m.buttonsResponseMessage)?.selectedDisplayText) ||
    str(obj(m.listResponseMessage)?.title) ||
    str(obj(m.templateButtonReplyMessage)?.selectedDisplayText);
  const kind: IncomingMessage["kind"] = m.imageMessage
    ? "image"
    : m.audioMessage
      ? "audio"
      : m.videoMessage
        ? "video"
        : m.stickerMessage
          ? "sticker"
          : text
            ? "text"
            : "other";
  if (kind === "other") return null; // reação, apagada, protocolo...
  // endereço novo (@lid) esconde o número: a Evolution manda o número de verdade em outro campo
  const alt = str(key?.remoteJidAlt) || str(key?.senderPn) || str(data.senderPn);
  const phone = /@s\.whatsapp\.net$/.test(jid) ? digits(jid) : alt ? digits(alt) : null;
  return { waId, jid, phone, fromMe: key?.fromMe === true, name: str(data.pushName).trim().slice(0, 80) || null, kind, text: text.trim().slice(0, 2000) };
}

/** mensagens novas do webhook da Evolution (outros eventos são ignorados) */
export function parseEvolutionWebhook(body: unknown): IncomingMessage[] {
  const b = obj(body);
  if (!b) return [];
  const event = str(b.event).toLowerCase().replace(/_/g, ".");
  if (event && event !== "messages.upsert") return [];
  const list = Array.isArray(b.data) ? b.data : [b.data];
  return list.map((d) => obj(d)).flatMap((d) => (d ? [parseOne(d)].filter((x): x is IncomingMessage => !!x) : []));
}

/** o que vai para o histórico (e para a IA) quando não é texto */
export function incomingText(m: IncomingMessage): string {
  if (m.kind === "text") return m.text;
  if (m.kind === "image") return m.text ? `[enviou uma foto] ${m.text}` : "[enviou uma foto]";
  if (m.kind === "video") return m.text ? `[enviou um vídeo] ${m.text}` : "[enviou um vídeo]";
  if (m.kind === "sticker") return "[enviou uma figurinha]";
  return "[enviou um áudio — você não consegue ouvir; peça com carinho para ele escrever]";
}

/** tempo "digitando..." antes de cada mensagem (ms): mais longa, mais tempo */
export function typingDelay(text: string): number {
  return Math.min(4500, 1200 + text.length * 35);
}

/** mensagem da uazapi: { EventType: "messages", message: { chatid, messageid, fromMe, text, mediaType, ... }, chat: {...} } */
export function parseUazapiWebhook(body: unknown): IncomingMessage[] {
  const b = obj(body);
  if (!b) return [];
  const event = (str(b.EventType) || str(b.event)).toLowerCase();
  if (event && event !== "messages") return [];
  const m = obj(b.message);
  const chat = obj(b.chat);
  if (!m) return [];
  const jid = str(m.chatid) || str(chat?.wa_chatid);
  const waId = str(m.messageid) || str(m.id);
  if (!jid || !waId) return [];
  if (m.isGroup === true || chat?.wa_isGroup === true || /@g\.us$|@broadcast$|@newsletter$/.test(jid)) return [];
  const content = obj(m.content);
  const text = (str(m.text) || (typeof m.content === "string" ? m.content : str(content?.text) || str(content?.caption))).trim();
  const media = str(m.mediaType).toLowerCase();
  const mtype = `${str(m.messageType)} ${str(m.type)}`.toLowerCase();
  if (/reaction|protocol|revoke|poll/.test(mtype)) return [];
  const kind: IncomingMessage["kind"] =
    media === "image" || /image/.test(mtype)
      ? "image"
      : media === "ptt" || media === "audio" || /audio/.test(mtype)
        ? "audio"
        : media === "video" || /video/.test(mtype)
          ? "video"
          : media === "sticker" || /sticker/.test(mtype)
            ? "sticker"
            : text
              ? "text"
              : "other";
  if (kind === "other") return [];
  const alt = str(m.sender_pn) || str(chat?.phone);
  const phone = /@s\.whatsapp\.net$/.test(jid) ? digits(jid) : alt ? digits(alt.includes("@") ? alt : `${alt}@s.whatsapp.net`) : null;
  const name = (str(m.senderName) || str(chat?.wa_contactName) || str(chat?.name)).trim().slice(0, 80) || null;
  return [{ waId, jid, phone, fromMe: m.fromMe === true, name, kind, text: text.slice(0, 2000), byApi: m.wasSentByApi === true }];
}

/** webhook de qualquer uma das duas (o formato diz de quem é) */
export function parseWebhook(body: unknown): IncomingMessage[] {
  const b = obj(body);
  if (!b) return [];
  return "EventType" in b || ("message" in b && "chat" in b) ? parseUazapiWebhook(b) : parseEvolutionWebhook(b);
}
