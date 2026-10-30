// Mensagens que chegam da Evolution (evento messages.upsert) → formato simples. Sem banco: dá para testar isolado.

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

/** mensagens novas do webhook (outros eventos são ignorados) */
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
