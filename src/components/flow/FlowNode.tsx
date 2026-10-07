import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { memo } from "react";
import type { ChoiceButton, FlowNode as FlowNodeT, OfferContent } from "@/types/flow";
import { NODE_META, nodeLabel } from "./nodeMeta";

export type HsNodeData = {
  node: FlowNodeT;
  hasError?: boolean;
  /** conteúdo pago (só liberado após pagamento aprovado) */
  paid?: boolean;
  productName?: string;
  tagName?: string;
  brainName?: string;
  videoName?: string;
  onToggleMinimize?: (id: string) => void;
};
export type HsFlowNode = Node<HsNodeData, "hs">;

function delayLabel(n: FlowNodeT) {
  const s = n.settings ?? {};
  if (n.type === "start" || n.type === "tag") return "";
  const mode = s.delayMode ?? (s.delayMs != null ? "fixed" : "inherit");
  if (mode === "inherit") return "⏱ padrão";
  if (mode === "auto") return "⏱ auto";
  if (mode === "random") return `⏱ ${((s.delayMinMs ?? 1000) / 1000).toFixed(1)}–${((s.delayMaxMs ?? 4000) / 1000).toFixed(1)}s`;
  return `⏱ ${((s.delayMs ?? 1500) / 1000).toFixed(1)}s`;
}

function FlowNodeView({ data, selected }: NodeProps<HsFlowNode>) {
  const n = data.node;
  const meta = NODE_META[n.type];
  const c = n.content as unknown as Record<string, unknown>;
  const minimized = !!n.settings?.minimized;
  const buttons: ChoiceButton[] =
    n.type === "buttons" || (n.type === "question" && c.mode === "buttons") ? ((c.buttons as ChoiceButton[]) ?? []) : [];

  let body: React.ReactNode = null;
  switch (n.type) {
    case "start":
      body = null;
      break;
    case "text":
      body = (
        <>
          {c.sender === "user" && <span className="pill" style={{ marginBottom: 4 }}>usuário</span>} {String(c.text ?? "")}
        </>
      );
      break;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      body = c.url ? <img src={String(c.url)} alt="" /> : <i>Sem imagem</i>;
      break;
    case "video":
    case "audio":
      body = c.url ? `${n.type === "video" ? "🎬" : "🎧"} ${c.viewOnce ? "① visualização única · " : ""}${String(c.caption || String(c.url).split("/").pop())}` : <i>Sem arquivo</i>;
      break;
    case "question":
      body = (
        <>
          {String(c.text ?? "")}
          {c.mode === "open" && <div className="dim" style={{ marginTop: 4 }}>↳ resposta aberta {c.variable ? `→ {${String(c.variable)}}` : ""}</div>}
        </>
      );
      break;
    case "buttons":
      body = c.text ? String(c.text) : null;
      break;
    case "offer":
      body = (
        <>
          {c.style === "call" && <div style={{ color: "#4ade80", fontWeight: 700 }}>📹 Chamada de vídeo{data.videoName ? ` · ${data.videoName}` : ""}</div>}
          <b style={{ color: "#fff" }}>{data.productName ?? "Selecione um produto"}</b>
          {(c as unknown as OfferContent).headline ? <div>{String(c.headline)}</div> : null}
          <div className="dim" style={{ marginTop: 4 }}>CTA: {String(c.ctaLabel || "QUERO ACESSAR ❤️")}</div>
        </>
      );
      break;
    case "delivery":
      body = (
        <>
          {String(c.text ?? "")}
          <div className="dim" style={{ marginTop: 4 }}>[ {String(c.buttonLabel || "ACESSAR MEU PRODUTO")} ]</div>
        </>
      );
      break;
    case "link":
      body = `${c.text ? String(c.text) + "\n" : ""}[ ${String(c.buttonLabel || "Abrir")} ] → ${String(c.url)}`;
      break;
    case "tag":
      body = data.tagName ? <span className="pill">{data.tagName}</span> : <i>Selecione uma tag</i>;
      break;
    case "end":
      body = c.text ? String(c.text) : <i>Conversa encerrada</i>;
      break;
    case "ai":
      body = (
        <>
          <b style={{ color: "#fff" }}>{data.brainName ?? "Selecione um cérebro"}</b>
          {c.goal ? <div>{String(c.goal)}</div> : null}
          <div className="dim" style={{ marginTop: 4 }}>{c.startMode === "ai" ? "A IA puxa a conversa" : "Espera o lead escrever"}</div>
        </>
      );
      break;
  }

  const hasDefaultOut = !["end", "offer", "buttons", "ai"].includes(n.type) && !(n.type === "question" && c.mode === "buttons");

  return (
    <div className={`hs-node t-${n.type} ${selected ? "selected" : ""} ${data.hasError ? "has-error" : ""} ${minimized ? "minimized" : ""}`}>
      {n.type !== "start" && <Handle type="target" position={Position.Top} />}
      <div className="nh">
        <span className="ni" style={{ background: `${meta.color}26`, color: meta.color }}>
          {meta.icon}
        </span>
        <span className="nt" style={{ color: meta.color }}>
          {nodeLabel(n)}
        </span>
        {data.paid && (
          <span className="paid-badge" title="Conteúdo pago: liberado só após pagamento aprovado">
            🔒 pago
          </span>
        )}
        <span className="nd">{delayLabel(n)}</span>
        {n.type !== "start" && (
          <button
            title={minimized ? "Expandir" : "Minimizar"}
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleMinimize?.(n.id);
            }}
          >
            {minimized ? "▢" : "–"}
          </button>
        )}
      </div>
      {body && <div className="nb">{body}</div>}
      {buttons.length > 0 && (
        <div className="outs">
          {c.inputMode !== "click" && <div className="dim" style={{ fontSize: 11 }}>✍️ o lead digita a resposta</div>}
          {buttons.map((b) => (
            <div key={b.id} className="out" title={b.keywords ? `Também: ${b.keywords}` : undefined}>
              {b.label}
              {b.keywords ? <span className="dim" style={{ fontWeight: 400 }}> · +{b.keywords.split(",").filter((k) => k.trim()).length}</span> : null}
              <Handle type="source" id={`btn:${b.id}`} position={Position.Right} />
            </div>
          ))}
          {c.inputMode !== "click" && (
            <div className="out other">
              ↳ Qualquer outra resposta
              <Handle type="source" id="default" position={Position.Right} />
            </div>
          )}
        </div>
      )}
      {n.type === "ai" && (
        <div className="outs">
          <div className="out approved" title="Quando o lead pagar uma das ofertas que a IA mostrou">
            ✓ Comprou (oferta da IA)
            <Handle type="source" id="payment:approved" position={Position.Right} />
          </div>
          <div className="out failed">
            ✕ Pagamento recusado
            <Handle type="source" id="payment:failed" position={Position.Right} />
          </div>
          <div className="out offers" title="A IA explica os produtos e, quando o lead estiver pronto, solta os botões ligados aqui (ex.: bloco Botões com as ofertas)">
            🛒 Mostrar botões de oferta
            <Handle type="source" id="ai:offers" position={Position.Right} />
          </div>
          <div className="out other" title="Quando a IA encerrar a conversa">
            ↳ Quando a IA encerrar
            <Handle type="source" id="default" position={Position.Right} />
          </div>
        </div>
      )}
      {n.type === "offer" && (
        <div className="outs">
          <div className="out approved">
            ✓ Pagamento aprovado
            <Handle type="source" id="payment:approved" position={Position.Right} />
          </div>
          <div className="out failed">
            ✕ Pagamento recusado
            <Handle type="source" id="payment:failed" position={Position.Right} />
          </div>
          {c.style === "call" ? (
            <div className="out failed" title="O lead tocou em Recusar na chamada (ex.: oferecer uma chamada mais curta e mais barata)">
              📵 Recusou a chamada
              <Handle type="source" id="btn:decline" position={Position.Right} />
            </div>
          ) : (
            <div className="out other" title="Mensagens, áudios e vídeos enviados logo após a oferta. Param quando o lead clica em comprar.">
              💬 Enquanto não compra
              <Handle type="source" id="default" position={Position.Right} />
            </div>
          )}
        </div>
      )}
      {hasDefaultOut && <Handle type="source" id="default" position={Position.Bottom} />}
    </div>
  );
}

export const FlowNodeComponent = memo(FlowNodeView);
