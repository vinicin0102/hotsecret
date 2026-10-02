import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { memo } from "react";
import type { ChoiceButton, FlowNode as FlowNodeT, OfferContent } from "@/types/flow";
import { NODE_META } from "./nodeMeta";

export type HsNodeData = {
  node: FlowNodeT;
  hasError?: boolean;
  productName?: string;
  tagName?: string;
  onToggleMinimize?: (id: string) => void;
};
export type HsFlowNode = Node<HsNodeData, "hs">;

function delayLabel(n: FlowNodeT) {
  const s = n.settings ?? {};
  if (n.type === "start" || n.type === "tag") return "";
  if (s.delayMode === "random") return `${((s.delayMinMs ?? 1000) / 1000).toFixed(1)}–${((s.delayMaxMs ?? 4000) / 1000).toFixed(1)}s`;
  return `${((s.delayMs ?? 1200) / 1000).toFixed(1)}s`;
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
      body = c.url ? `${n.type === "video" ? "🎬" : "🎧"} ${String(c.caption || String(c.url).split("/").pop())}` : <i>Sem arquivo</i>;
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
  }

  const hasDefaultOut = !["end", "offer", "buttons"].includes(n.type) && !(n.type === "question" && c.mode === "buttons");

  return (
    <div className={`hs-node t-${n.type} ${selected ? "selected" : ""} ${data.hasError ? "has-error" : ""} ${minimized ? "minimized" : ""}`}>
      {n.type !== "start" && <Handle type="target" position={Position.Top} />}
      <div className="nh">
        <span className="ni" style={{ background: `${meta.color}26`, color: meta.color }}>
          {meta.icon}
        </span>
        <span className="nt" style={{ color: meta.color }}>
          {n.settings?.label || meta.label}
        </span>
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
          {buttons.map((b) => (
            <div key={b.id} className="out">
              {b.label}
              <Handle type="source" id={`btn:${b.id}`} position={Position.Right} />
            </div>
          ))}
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
        </div>
      )}
      {hasDefaultOut && <Handle type="source" id="default" position={Position.Bottom} />}
    </div>
  );
}

export const FlowNodeComponent = memo(FlowNodeView);
