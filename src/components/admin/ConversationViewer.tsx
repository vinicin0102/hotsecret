import { formatBRL, formatDateTime, formatTime } from "@/lib/format";

export interface ViewerMessage {
  id: string;
  sender: string;
  type: string;
  content: Record<string, unknown>;
  createdAt: string;
}

/** Histórico completo da conversa, em ordem cronológica. */
export function ConversationViewer({ messages }: { messages: ViewerMessage[] }) {
  if (!messages.length) return <div className="empty">Nenhuma mensagem nesta conversa.</div>;
  let lastDay = "";
  return (
    <div className="conversation-viewer">
      {messages.map((m) => {
        const day = new Date(m.createdAt).toLocaleDateString("pt-BR");
        const sep = day !== lastDay ? <div className="event-line">{day}</div> : null;
        lastDay = day;
        const c = m.content ?? {};
        const sender = m.sender === "user" ? "user" : m.sender === "system" ? "system" : "bot";
        let body: React.ReactNode;
        switch (m.type) {
          case "image":
            body = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={String(c.url)} alt="" style={{ maxWidth: 220, borderRadius: 12, display: "block" }} />
                {c.caption ? <div>{String(c.caption)}</div> : null}
              </>
            );
            break;
          case "video":
            body = <>🎬 Vídeo {c.caption ? `— ${String(c.caption)}` : ""}</>;
            break;
          case "audio":
            body = <>🎧 Áudio {c.caption ? `— ${String(c.caption)}` : ""}</>;
            break;
          case "buttons":
            body = (
              <>
                {c.text ? <div>{String(c.text)}</div> : null}
                <div className="hint" style={{ color: "rgba(255,255,255,.7)" }}>
                  Opções: {((c.buttons as string[]) ?? []).join(" · ")}
                </div>
              </>
            );
            break;
          case "offer":
            body = (
              <div className="mini-offer">
                <div className="eyebrow gold" style={{ fontSize: 10, letterSpacing: ".14em" }}>
                  OFERTA EXIBIDA
                </div>
                <b>{String(c.headline ?? c.name ?? "")}</b> — {formatBRL(Number(c.price ?? 0))}
              </div>
            );
            break;
          case "delivery":
          case "link":
            body = (
              <>
                {c.text ? <div>{String(c.text)}</div> : null}
                <div className="hint" style={{ color: "var(--gold)" }}>[ {String(c.buttonLabel || (m.type === "delivery" ? "ACESSAR MEU PRODUTO" : "Abrir"))} ]</div>
              </>
            );
            break;
          case "recovery":
            body = (
              <>
                <div className="hint" style={{ color: "var(--gold)" }}>Recuperação de checkout</div>
                {String(c.text ?? "")}
              </>
            );
            break;
          default:
            body = String(c.text ?? "");
        }
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {sep}
            <div className={`msg-row ${sender}`} style={{ animation: "none" }}>
              <div className={`bubble ${sender}`} title={formatDateTime(m.createdAt)}>
                {body}
                {sender !== "system" && <span className="time">{formatTime(m.createdAt)}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
