// Painel lateral de edição do nó selecionado.
import type { ChoiceButton, FlowNode, NodeType } from "@/types/flow";
import { shortId } from "@/features/chat-engine/engine";
import { UploadInput } from "@/components/admin/UploadInput";
import { formatBRL } from "@/lib/format";
import { NODE_META, nodeTypeLabel } from "./nodeMeta";
import { DelayEditor } from "./DelayEditor";

export interface SidebarProduct {
  id: string;
  name: string;
  price: number;
  active: boolean;
}
export interface SidebarTag {
  id: string;
  name: string;
}

interface Props {
  node: FlowNode;
  products: SidebarProduct[];
  tags: SidebarTag[];
  onChange: (node: FlowNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  readOnly?: boolean;
}

const VARIABLES = [
  ["", "Não salvar"],
  ["name", "Nome do lead"],
  ["email", "E-mail do lead"],
  ["phone", "Telefone do lead"],
  ["resposta", "Variável livre: resposta"],
];

export function FlowSidebar({ node, products, tags, onChange, onDelete, onDuplicate, onClose, readOnly }: Props) {
  const meta = NODE_META[node.type];
  const c = node.content as unknown as Record<string, unknown>;
  const s = node.settings ?? {};
  const setContent = (patch: Record<string, unknown>) => onChange({ ...node, content: { ...c, ...patch } as FlowNode["content"] });
  const setSettings = (patch: Partial<FlowNode["settings"]>) => onChange({ ...node, settings: { ...s, ...patch } });
  const hasDelay = !(["start", "tag"] as NodeType[]).includes(node.type);
  const buttons = (c.buttons as ChoiceButton[] | undefined) ?? [];
  const showButtons = node.type === "buttons" || (node.type === "question" && c.mode === "buttons");

  const updateButton = (i: number, label: string) => setContent({ buttons: buttons.map((b, j) => (j === i ? { ...b, label } : b)) });
  const removeButton = (i: number) => setContent({ buttons: buttons.filter((_, j) => j !== i) });
  const addButton = () => setContent({ buttons: [...buttons, { id: shortId("b"), label: "Nova opção" }] });

  return (
    <aside className="flow-sidebar">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Editar {nodeTypeLabel(node).toLowerCase()}</h3>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      <div className="sub">
        {meta.hint} · <code className="inline">{node.id}</code>
      </div>

      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        {node.type !== "start" && (
          <div className="field">
            <label>Rótulo no canvas (opcional)</label>
            <input className="input" value={s.label ?? ""} placeholder={nodeTypeLabel(node)} onChange={(e) => setSettings({ label: e.target.value })} />
          </div>
        )}

        {node.type === "text" && (
          <>
            <div className="field">
              <label>Conteúdo</label>
              <textarea className="textarea" rows={5} value={String(c.text ?? "")} onChange={(e) => setContent({ text: e.target.value })} />
            </div>
            <div className="field">
              <label>Remetente</label>
              <select className="select" value={String(c.sender ?? "bot")} onChange={(e) => setContent({ sender: e.target.value })}>
                <option value="bot">Personagem</option>
                <option value="user">Usuário (mensagem simulada)</option>
              </select>
            </div>
          </>
        )}

        {node.type === "image" && (
          <>
            <div className="field">
              <label>Imagem</label>
              <UploadInput value={String(c.url ?? "")} onChange={(url) => setContent({ url })} accept="image/*" />
            </div>
            <div className="field">
              <label>Legenda</label>
              <input className="input" value={String(c.caption ?? "")} onChange={(e) => setContent({ caption: e.target.value })} />
            </div>
          </>
        )}

        {node.type === "video" && (
          <>
            <div className="field">
              <label>Vídeo (mp4/webm)</label>
              <UploadInput value={String(c.url ?? "")} onChange={(url) => setContent({ url })} accept="video/mp4,video/webm" />
            </div>
            <div className="field">
              <label>Thumbnail</label>
              <UploadInput value={String(c.thumbnailUrl ?? "")} onChange={(url) => setContent({ thumbnailUrl: url })} accept="image/*" />
            </div>
            <div className="field">
              <label>Legenda</label>
              <input className="input" value={String(c.caption ?? "")} onChange={(e) => setContent({ caption: e.target.value })} />
            </div>
            <label className="checkbox" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={!!c.autoplay} onChange={(e) => setContent({ autoplay: e.target.checked })} />
              Autoplay (sem som)
            </label>
          </>
        )}

        {node.type === "audio" && (
          <>
            <div className="field">
              <label>Áudio (mp3/m4a/ogg)</label>
              <UploadInput value={String(c.url ?? "")} onChange={(url) => setContent({ url })} accept="audio/*" />
            </div>
            <div className="field">
              <label>Duração (segundos)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={c.durationSec != null ? Number(c.durationSec) : ""}
                onChange={(e) => setContent({ durationSec: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div className="field">
              <label>Legenda</label>
              <input className="input" value={String(c.caption ?? "")} onChange={(e) => setContent({ caption: e.target.value })} />
            </div>
          </>
        )}

        {(node.type === "question" || node.type === "buttons") && (
          <div className="field">
            <label>{node.type === "question" ? "Pergunta" : "Pergunta / mensagem antes da resposta (opcional)"}</label>
            <textarea className="textarea" rows={3} value={String(c.text ?? "")} onChange={(e) => setContent({ text: e.target.value })} />
          </div>
        )}

        {node.type === "question" && (
          <>
            <div className="field">
              <label>Tipo de resposta</label>
              <div className="segmented">
                {(["open", "buttons"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={c.mode === m ? "active" : ""}
                    onClick={() => setContent({ mode: m, buttons: m === "buttons" && !buttons.length ? [{ id: shortId("b"), label: "Sim" }, { id: shortId("b"), label: "Não" }] : buttons })}
                  >
                    {m === "open" ? "Resposta aberta" : "Botões"}
                  </button>
                ))}
              </div>
            </div>
            {c.mode === "open" && (
              <>
                <div className="field">
                  <label>Salvar resposta em</label>
                  <select className="select" value={String(c.variable ?? "")} onChange={(e) => setContent({ variable: e.target.value })}>
                    {VARIABLES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Placeholder</label>
                  <input className="input" value={String(c.placeholder ?? "")} onChange={(e) => setContent({ placeholder: e.target.value })} />
                </div>
              </>
            )}
          </>
        )}

        {showButtons && (
          <>
            <div className="field">
              <label>Como o lead responde</label>
              <div className="segmented">
                {(
                  [
                    ["type", "Digitando"],
                    ["both", "Digitando ou clicando"],
                    ["click", "Só botões"],
                  ] as const
                ).map(([m, l]) => (
                  <button key={m} type="button" className={((c.inputMode as string) ?? "type") === m ? "active" : ""} onClick={() => setContent({ inputMode: m })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {(c.inputMode ?? "type") !== "click" && (
              <div className="field">
                <label>Texto de ajuda no campo (opcional)</label>
                <input className="input" placeholder="Digite sua resposta..." value={String(c.placeholder ?? "")} onChange={(e) => setContent({ placeholder: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label>Caminhos (cada um leva a um nó)</label>
              {buttons.map((b, i) => (
                <div key={b.id} style={{ marginBottom: 10 }}>
                  <div className="btn-editor-row">
                    <input className="input" value={b.label} maxLength={80} placeholder="Ex.: Sim" onChange={(e) => updateButton(i, e.target.value)} />
                    <button type="button" className="btn btn-icon btn-ghost" onClick={() => removeButton(i)} aria-label="Remover caminho">
                      ✕
                    </button>
                  </div>
                  {(c.inputMode ?? "type") !== "click" && (
                    <input
                      className="input"
                      style={{ fontSize: 13, padding: "8px 12px" }}
                      placeholder="Outras palavras que levam aqui (ex.: quero, claro, pode)"
                      value={b.keywords ?? ""}
                      onChange={(e) => setContent({ buttons: buttons.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)) })}
                    />
                  )}
                </div>
              ))}
              {buttons.length < 10 && (
                <button type="button" className="btn btn-sm" onClick={addButton}>
                  + Adicionar caminho
                </button>
              )}
              <span className="hint">
                {(c.inputMode ?? "type") === "click"
                  ? "Arraste a bolinha à direita de cada botão até o próximo nó."
                  : "O lead digita o que quiser. Se a resposta contiver o nome do caminho ou uma das palavras, segue por ele (sem diferenciar acentos/maiúsculas). Se nada bater, segue por “Qualquer outra resposta” — ou pelo 1º caminho, se essa saída não estiver conectada."}
              </span>
            </div>
          </>
        )}

        {node.type === "offer" && (
          <>
            <div className="field">
              <label>Produto</label>
              <select className="select" value={String(c.productId ?? "")} onChange={(e) => setContent({ productId: e.target.value })}>
                <option value="">— selecione —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatBRL(p.price)} {p.active ? "" : "(inativo)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Título do card (opcional)</label>
              <input className="input" value={String(c.headline ?? "")} onChange={(e) => setContent({ headline: e.target.value })} />
            </div>
            <div className="field">
              <label>Descrição (opcional)</label>
              <textarea className="textarea" rows={3} value={String(c.description ?? "")} onChange={(e) => setContent({ description: e.target.value })} />
            </div>
            <div className="field">
              <label>Texto do botão</label>
              <input className="input" value={String(c.ctaLabel ?? "")} onChange={(e) => setContent({ ctaLabel: e.target.value })} />
            </div>
            <p className="hint">
              O visitante não preenche nada: ao tocar no botão ele recebe a chave PIX na hora.
              <br />
              Tudo que vier depois de <b>Pagamento aprovado</b> é o <b>conteúdo pago</b> (marcado com 🔒): fica bloqueado no servidor e só é
              entregue no chat quando o gateway confirma o pagamento. Conecte também <b>Pagamento recusado</b>.
            </p>
            <p className="hint">
              <b>💬 Enquanto não compra:</b> conecte essa saída a mensagens, áudios, vídeos ou botões para explicar o produto e quebrar
              objeções logo depois do card. Elas usam o tempo de cada bloco e param assim que o lead toca em comprar ou o pagamento é
              aprovado. O card continua disponível o tempo todo.
            </p>
          </>
        )}

        {node.type === "delivery" && (
          <>
            <div className="field">
              <label>Mensagem</label>
              <textarea className="textarea" rows={3} value={String(c.text ?? "")} onChange={(e) => setContent({ text: e.target.value })} />
            </div>
            <div className="field">
              <label>Produto liberado</label>
              <select className="select" value={String(c.productId ?? "")} onChange={(e) => setContent({ productId: e.target.value || undefined })}>
                <option value="">Último produto comprado</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="hint">Opcional: use só se o produto tiver um link externo. Para entregar o conteúdo no próprio chat, basta colocar os blocos (texto, imagem, vídeo, áudio) depois de “Pagamento aprovado”.</span>
            </div>
            <div className="field">
              <label>Texto do botão</label>
              <input className="input" value={String(c.buttonLabel ?? "")} onChange={(e) => setContent({ buttonLabel: e.target.value })} />
            </div>
          </>
        )}

        {node.type === "link" && (
          <>
            <div className="field">
              <label>Mensagem (opcional)</label>
              <textarea className="textarea" rows={2} value={String(c.text ?? "")} onChange={(e) => setContent({ text: e.target.value })} />
            </div>
            <div className="field">
              <label>URL</label>
              <input className="input" value={String(c.url ?? "")} onChange={(e) => setContent({ url: e.target.value })} />
            </div>
            <div className="field">
              <label>Texto do botão</label>
              <input className="input" value={String(c.buttonLabel ?? "")} onChange={(e) => setContent({ buttonLabel: e.target.value })} />
            </div>
          </>
        )}

        {node.type === "tag" && (
          <div className="field">
            <label>Tag aplicada ao lead</label>
            <select className="select" value={String(c.tagId ?? "")} onChange={(e) => setContent({ tagId: e.target.value })}>
              <option value="">— selecione —</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="hint">Crie tags em Configurações.</span>
          </div>
        )}

        {node.type === "end" && (
          <div className="field">
            <label>Mensagem final (opcional)</label>
            <textarea className="textarea" rows={3} value={String(c.text ?? "")} onChange={(e) => setContent({ text: e.target.value })} />
          </div>
        )}

        {hasDelay && (
          <>
            <div className="section-title">Atraso antes desta mensagem</div>
            <DelayEditor
              allowInherit
              value={{
                // nós antigos com delayMs e sem modo contam como "fixo"
                mode: s.delayMode ?? (s.delayMs != null ? "fixed" : "inherit"),
                ms: s.delayMs,
                minMs: s.delayMinMs,
                maxMs: s.delayMaxMs,
              }}
              onChange={(v) => setSettings({ delayMode: v.mode, delayMs: v.ms, delayMinMs: v.minMs, delayMaxMs: v.maxMs })}
            />
            <label className="checkbox" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={s.showTyping ?? true} onChange={(e) => setSettings({ showTyping: e.target.checked })} />
              Mostrar “digitando...” durante o delay
            </label>
          </>
        )}
      </fieldset>

      {node.type !== "start" && !readOnly && (
        <div className="footer">
          <button className="btn btn-sm" onClick={onDuplicate}>
            Duplicar nó
          </button>
          <button className="btn btn-sm" onClick={() => setSettings({ minimized: !s.minimized })}>
            {s.minimized ? "Expandir" : "Minimizar"}
          </button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>
            Excluir nó
          </button>
        </div>
      )}
    </aside>
  );
}
