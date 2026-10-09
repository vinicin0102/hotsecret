// Editor da oferta "Canal VIP AO VIVO" (bloco Oferta do fluxo e ofertas do Cérebro):
// 2º ingresso (acesso básico), textos do upgrade, mensagens do pagamento e o pop-up de saída.
import type { VipOfferTexts } from "@/types/flow";
import { formatMoney } from "@/lib/format";
import { UploadInput } from "./UploadInput";

const linesOf = (v: string) => v.split("\n");

export function VipOfferEditor({
  vip,
  basicProductId,
  products,
  mainProductId,
  onChange,
  onBasicChange,
}: {
  vip: VipOfferTexts | undefined;
  basicProductId: string | undefined;
  products: { id: string; name: string; price: number; currency?: string; active?: boolean }[];
  mainProductId?: string;
  onChange: (vip: VipOfferTexts) => void;
  onBasicChange: (productId: string) => void;
}) {
  const v = vip ?? {};
  const set = (patch: Partial<VipOfferTexts>) => onChange({ ...v, ...patch });
  const field = (key: keyof VipOfferTexts, label: string, placeholder: string) => (
    <div className="field">
      <label>{label}</label>
      <input className="input" placeholder={placeholder} value={(v[key] as string | undefined) ?? ""} onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  );
  return (
    <div className="vip-editor">
      <p className="hint" style={{ marginTop: 0 }}>
        Abre um <b>upgrade</b> por cima do chat com os benefícios e dois ingressos. Ao escolher, gera o pagamento numa folha embaixo, com o chat
        visível acima (as mensagens de conversão vão aparecendo). Se ele tentar fechar, aparece <b>“Vai desistir agora?”</b>. Campos vazios usam o
        texto padrão (no idioma do fluxo).
      </p>
      <div className="field">
        <label>Ingresso 2 — acesso básico (opcional)</label>
        <select className="select" value={basicProductId ?? ""} onChange={(e) => onBasicChange(e.target.value)}>
          <option value="">— só o acesso completo —</option>
          {products
            .filter((p) => p.id !== mainProductId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatMoney(p.price, p.currency)} {p.active === false ? "(inativo)" : ""}
              </option>
            ))}
        </select>
        <span className="hint">O ingresso 1 (acesso completo) é o produto da oferta.</span>
      </div>
      <div className="grid-2">
        {field("badge", "Selo do topo", "UPGRADE EXCLUSIVO 💎")}
        {field("intro", "Frase acima dos benefícios", "Libere a ligação privada completa e ganhe acesso a:")}
      </div>
      <div className="grid-2">
        {field("title", "Título", "QUER O ACESSO")}
        {field("highlight", "Título em destaque (verde)", "TOTAL? 💦")}
      </div>
      <div className="field">
        <label>Benefícios (um por linha)</label>
        <textarea
          className="textarea"
          rows={4}
          placeholder={"Tiro a roupa toda pra você 😍\nPasso meu WhatsApp pessoal agora 📱"}
          value={(v.benefits ?? []).join("\n")}
          onChange={(e) => set({ benefits: linesOf(e.target.value) })}
        />
      </div>
      <div className="grid-2">
        {field("completeLabel", "Botão do ingresso 1", "ACESSO COMPLETO")}
        {field("basicLabel", "Botão do ingresso 2", "ACESSO BÁSICO")}
      </div>
      <div className="grid-2">
        {field("payTitle", "Título do pagamento", "{NOME} COMEÇOU!")}
        {field("paySubtitle", "Subtítulo do pagamento", "Vídeo chamada iniciada... Realize o pagamento para participar!")}
      </div>
      <div className="field">
        <label>Mensagens no chat durante o pagamento (uma por linha)</label>
        <textarea
          className="textarea"
          rows={4}
          placeholder={"Oii bebê, tô te esperando aqui 😈\npaga e vem ver 💦"}
          value={(v.payMessages ?? []).join("\n")}
          onChange={(e) => set({ payMessages: linesOf(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Imagem bloqueada no chat (opcional — aparece borrada com cadeado)</label>
        <UploadInput value={v.lockedImageUrl ?? ""} onChange={(url) => set({ lockedImageUrl: url })} accept="image/*" />
      </div>
      <div className="grid-2">
        {field("exitTitle", "Pop-up de saída: título", "Vai desistir agora?")}
        {field("exitText", "Pop-up de saída: texto", "Seu acesso VIP está quase liberado...")}
      </div>
      <div className="grid-2">
        {field("stayLabel", "Botão para ficar", "Não vou desistir 🔥")}
        {field("leaveLabel", "Botão para sair", "SOU BROXA 🤏")}
      </div>
    </div>
  );
}
