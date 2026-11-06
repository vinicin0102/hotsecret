// Editor da oferta "Canal VIP AO VIVO" (bloco Oferta do fluxo e ofertas do Cérebro):
// 2º ingresso (acesso básico), textos do upgrade, mensagens do pagamento e o pop-up de saída.
import type { VipOfferTexts } from "@/types/flow";
import { productOption } from "@/lib/format";
import { missingDdi, whatsappDigits, whatsappLink } from "@/lib/whatsapp";
import { UploadInput } from "./UploadInput";
import { withBase } from "@/lib/paths";

const linesOf = (v: string) => v.split("\n");

/** "Áudio no pagamento": mensagem de voz da modelo no topo da tela do PIX (Canal VIP e ligação) */
export function PayAudioField({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  return (
    <div className="field">
      <label>Áudio no pagamento (opcional — aparece no topo, como mensagem de voz da modelo)</label>
      <UploadInput value={value ?? ""} onChange={onChange} accept="audio/*" />
      <span className="hint">
        Ex.: ela explicando como copiar o PIX e pagar no app do banco. Toca sozinho quando a tela de pagamento abre (na 1ª vez); o lead pode
        ouvir de novo.
      </span>
    </div>
  );
}

export function VipOfferEditor({
  vip,
  basicProductId,
  products,
  mainProductId,
  onChange,
  onBasicChange,
  videos = [],
  videoId,
  onVideoChange,
  inCall,
  whatsapp,
  onWhatsappChange,
}: {
  /** tema WhatsApp: número para o botão depois do pagamento (guardado fora dos textos — só sai do servidor depois do PIX) */
  whatsapp?: { phone: string; message?: string };
  onWhatsappChange?: (w: { phone: string; message?: string } | undefined) => void;
  /** oferta dentro da chamada (aba Vídeos): sem os campos que só existem no chat (mensagens, imagem bloqueada, pop-up de saída) */
  inCall?: boolean;
  vip: VipOfferTexts | undefined;
  basicProductId: string | undefined;
  /** vídeos da aba Vídeos: o escolhido é liberado depois do pagamento (igual à chamada de vídeo) */
  videos?: { id: string; name: string }[];
  videoId?: string;
  onVideoChange?: (videoId: string) => void;
  products: { id: string; name: string; price: number; currency?: string; active?: boolean }[];
  mainProductId?: string;
  onChange: (vip: VipOfferTexts) => void;
  onBasicChange: (productId: string) => void;
}) {
  const v = vip ?? {};
  const set = (patch: Partial<VipOfferTexts>) => onChange({ ...v, ...patch });
  /** tema WhatsApp com conversa escrita: ela substitui título, destaque, frase e benefícios no pop-up */
  const chatOn = v.theme === "whatsapp" && (v.waChat ?? []).some((m) => m.text?.trim());
  const field = (key: keyof VipOfferTexts, label: string, placeholder: string) => (
    <div className="field">
      <label>{label}</label>
      <input className="input" placeholder={placeholder} value={(v[key] as string | undefined) ?? ""} onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  );
  return (
    <div className="vip-editor">
      <div className="field vip-wide">
        <label>Tema do pop-up</label>
        <div className="segmented">
          {(
            [
              ["default", "Padrão"],
              ["whatsapp", "💬 WhatsApp"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={(v.theme ?? "default") === k ? "active" : ""} onClick={() => set({ theme: k === "default" ? undefined : k })}>
              {label}
            </button>
          ))}
        </div>
        {v.theme === "whatsapp" && (
          <span className="hint">
            O pop-up vira uma conversa: barra verde com a foto e o nome dela, as mensagens abaixo, o preço em balão e o botão verde — o pagamento e o
            “vai desistir?” também ficam verdes.
          </span>
        )}
      </div>
      {v.theme === "whatsapp" && <WaChatEditor vip={v} onChange={set} />}
      {v.theme === "whatsapp" && onWhatsappChange && <WaNumberEditor value={whatsapp} onChange={onWhatsappChange} />}
      {!inCall && (
      <p className="hint" style={{ marginTop: 0 }}>
        Abre um <b>upgrade</b> por cima do chat com os benefícios e dois ingressos. Ao escolher, gera o pagamento numa folha embaixo, com o chat
        visível acima (as mensagens de conversão vão aparecendo). Se ele tentar fechar, aparece <b>“Vai desistir agora?”</b>. Campos vazios usam o
        texto padrão (no idioma do fluxo).
      </p>
      )}
      <div className="field">
        <label>Ingresso 2 — acesso básico (opcional)</label>
        <select className="select" value={basicProductId ?? ""} onChange={(e) => onBasicChange(e.target.value)}>
          <option value="">— só o acesso completo —</option>
          {products
            .filter((p) => p.id !== mainProductId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {productOption(p)} {p.active === false ? "(inativo)" : ""}
              </option>
            ))}
        </select>
        <span className="hint">O ingresso 1 (acesso completo) é o produto da oferta.</span>
      </div>
      {onVideoChange && (
        <div className="field">
          <label>Vídeo liberado depois do pagamento</label>
          <select className="select" value={videoId ?? ""} onChange={(e) => onVideoChange(e.target.value)}>
            <option value="">— nenhum (segue o ramo “Comprou” / botão de acesso) —</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {videoId ? (
            <a className="hint" href={withBase(`/admin/videos/${videoId}`)} target="_blank" rel="noreferrer">
              Editar trechos FREE/VIP, falas e upsells ↗
            </a>
          ) : (
            <span className="hint">
              Igual à chamada de vídeo: pagou (qualquer um dos ingressos), a chamada abre com o vídeo, as falas e os upsells marcados. Envie e edite em{" "}
              <a href={withBase("/admin/videos")}>▶ Vídeos</a>.
            </span>
          )}
        </div>
      )}
      {!inCall && (
        <div className="vip-editor-preview">
          <div className="field">
            <label>Prévia ao tocar no card (vídeo ou foto — opcional)</label>
            <UploadInput value={v.previewUrl ?? ""} onChange={(url) => set({ previewUrl: url })} accept="image/*,video/*" />
            <span className="hint">
              Com prévia, ao tocar no card abre a prévia da live com o título, os <b>benefícios</b> (abaixo) e o botão que <b>já gera o PIX</b>. Vídeo toca
              sem som, em loop; tocar no vídeo liga o som. Vídeos curtos e leves.
            </span>
          </div>
          <div className="grid-2">
            {field("previewTitle", "Título da prévia", "Já estou começando 🔴")}
            {field("previewButton", "Botão da prévia", "GERAR PIX")}
          </div>
        </div>
      )}
      {chatOn ? (
        <>
          {field("badge", "Selo do topo", "UPGRADE EXCLUSIVO 💎")}
          <p className="hint vip-wide">
            💬 A <b>Conversa do pop-up</b> está preenchida: o pop-up mostra essas mensagens no lugar de título, destaque, frase e benefícios (por isso
            esses campos não aparecem aqui). Para voltar a usá-los, apague as mensagens da conversa.
          </p>
        </>
      ) : (
        <>
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
        </>
      )}
      <div className="grid-2">
        {field("completeLabel", "Botão do ingresso 1", "ACESSO COMPLETO")}
        {field("basicLabel", "Botão do ingresso 2", "ACESSO BÁSICO")}
      </div>
      <div className="grid-2">
        {field("payTitle", "Título do pagamento", "{NOME} COMEÇOU!")}
        {field("paySubtitle", "Subtítulo do pagamento", "Vídeo chamada iniciada... Realize o pagamento para participar!")}
      </div>
      <PayAudioField value={v.payAudioUrl} onChange={(url) => set({ payAudioUrl: url })} />
      {!inCall && (
      <>
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
      </>
      )}
    </div>
  );
}

/** tema WhatsApp: a conversa do pop-up, mensagem por mensagem (dela ou do lead) */
function WaChatEditor({ vip: v, onChange }: { vip: VipOfferTexts; onChange: (patch: Partial<VipOfferTexts>) => void }) {
  const chat = v.waChat ?? [];
  const setChat = (next: NonNullable<VipOfferTexts["waChat"]>) => onChange({ waChat: next.length ? next : undefined });
  const setMsg = (i: number, patch: Partial<NonNullable<VipOfferTexts["waChat"]>[number]>) => setChat(chat.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= chat.length) return;
    const next = [...chat];
    [next[i], next[j]] = [next[j], next[i]];
    setChat(next);
  };
  /** começa a conversa com o que já está nos campos (título, frase, benefícios) */
  const fromFields = () =>
    setChat(
      [
        [v.title, v.highlight].filter(Boolean).join(" "),
        v.intro ?? "",
        ...(v.benefits ?? []),
      ]
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ from: "in" as const, text })),
    );
  return (
    <div className="field wa-chat-editor vip-wide">
      <label>Conversa do pop-up</label>
      <span className="hint">
        Escreva as mensagens como numa conversa do WhatsApp. <b>Ela</b> = balão cinza (recebido); <b>Lead</b> = balão verde (enviado, com ✓✓). Use{" "}
        <code>{"{nome}"}</code> para o nome dela. O preço e o botão aparecem sozinhos no fim. Com mensagens aqui, título, destaque, frase e benefícios
        deixam de valer (somem do editor); sem nenhuma, o pop-up usa esses campos.
      </span>
      {chat.map((m, i) => (
        <div key={i} className="wa-chat-row">
          <select className="select" value={m.from} onChange={(e) => setMsg(i, { from: e.target.value as "in" | "out" })} aria-label={`Quem envia a mensagem ${i + 1}`}>
            <option value="in">Ela</option>
            <option value="out">Lead</option>
          </select>
          <input className="input" value={m.text} maxLength={400} placeholder="Mensagem…" onChange={(e) => setMsg(i, { text: e.target.value })} aria-label={`Mensagem ${i + 1}`} />
          <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir mensagem">
            ↑
          </button>
          <button type="button" className="btn btn-sm" disabled={i === chat.length - 1} onClick={() => move(i, 1)} aria-label="Descer mensagem">
            ↓
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChat(chat.filter((_, j) => j !== i))} aria-label="Remover mensagem">
            ✕
          </button>
        </div>
      ))}
      <div className="row" style={{ flexWrap: "wrap" }}>
        {chat.length < 15 && (
          <button type="button" className="btn btn-sm" onClick={() => setChat([...chat, { from: "in", text: "" }])}>
            + Mensagem
          </button>
        )}
        {!chat.length && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={fromFields}>
            Começar com os textos atuais
          </button>
        )}
      </div>
    </div>
  );
}

/** tema WhatsApp: o número que o lead recebe depois do pagamento (botão "Chamar no WhatsApp") */
function WaNumberEditor({ value, onChange }: { value?: { phone: string; message?: string }; onChange: (w: { phone: string; message?: string } | undefined) => void }) {
  const w = value ?? { phone: "" };
  const set = (patch: Partial<{ phone: string; message: string }>) => {
    const next = { ...w, ...patch };
    onChange(next.phone.trim() || next.message?.trim() ? next : undefined);
  };
  const link = whatsappLink(w.phone, w.message);
  return (
    <div className="field vip-wide">
      <label>Botão do WhatsApp depois do pagamento</label>
      <div className="grid-2">
        <input className="input" inputMode="tel" placeholder="Número com DDI: +55 11 98765-4321" value={w.phone} onChange={(e) => set({ phone: e.target.value })} aria-label="Número do WhatsApp" />
        <input className="input" placeholder="Mensagem que já vai escrita (opcional)" value={w.message ?? ""} onChange={(e) => set({ message: e.target.value })} aria-label="Mensagem do WhatsApp" />
      </div>
      {w.phone.trim() && !whatsappDigits(w.phone) ? (
        <p className="error-text">Número inválido — use DDI + DDD + número.</p>
      ) : w.phone.trim() && missingDdi(w.phone) ? (
        <p className="error-text">Falta o DDI do país no começo (Brasil 55, México 52, Argentina 54). Sem ele o WhatsApp abre outro número.</p>
      ) : link ? (
        <span className="hint">
          Pagou, aparece <b>“Chamar no WhatsApp”</b> e o lead vai para <b>+{link.slice("https://wa.me/".length).split("?")[0]}</b> ·{" "}
          <a href={link} target="_blank" rel="noreferrer">
            testar o link ↗
          </a>
          . O número só chega ao celular dele depois do PIX aprovado.
        </span>
      ) : (
        <span className="hint">Vazio: sem botão de WhatsApp depois do pagamento.</span>
      )}
    </div>
  );
}
