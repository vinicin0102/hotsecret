// Editor do upsell em tela cheia (aba Vídeos): cada upsell com o seu tema — modelos prontos e textos editáveis.
import type { UpsellScreen } from "@/types/video";

/** modelos prontos (o dono edita à vontade). {nome} = nome do personagem. */
export const UPSELL_SCREEN_PRESETS: { id: string; label: string; screen: UpsellScreen }[] = [
  {
    id: "conexao",
    label: "📡 Conexão privada",
    screen: {
      icon: "📡",
      title: "CONEXÃO PRIVADA",
      tag: "⚠️ ÁREA EXCLUSIVA",
      text: "Sua chamada com {nome} chegou na parte privada. Libere a conexão privada para continuar.",
      button: "🔄 LIBERAR CONEXÃO",
      lockIcon: "🔒",
      lockBadge: "CONEXÃO PRIVADA",
      lockTitle: "LIBERE SUA CONEXÃO PRIVADA",
      lockText: "Para continuar no privado de {nome}, libere a conexão privada.",
      feeLabel: "CONEXÃO PRIVADA",
      payButton: "🔄 LIBERAR AGORA",
      footNote: "Após o pagamento a chamada continua automaticamente",
      payIcon: "🔄",
      payTitle: "CONEXÃO PRIVADA",
    },
  },
  {
    id: "idade",
    label: "🔞 +18 sem censura",
    screen: {
      icon: "🔞",
      title: "CONTEÚDO +18",
      tag: "⚠️ SEM CENSURA A PARTIR DAQUI",
      text: "Daqui pra frente {nome} fica sem censura. Libere para continuar assistindo.",
      button: "🔓 LIBERAR +18",
      lockIcon: "🔞",
      lockBadge: "CONTEÚDO +18",
      lockTitle: "LIBERE A PARTE SEM CENSURA",
      lockText: "Para ver {nome} sem censura, libere esta parte.",
      feeLabel: "ACESSO +18 SEM CENSURA",
      payButton: "🔓 LIBERAR AGORA",
      footNote: "Após o pagamento a chamada continua automaticamente",
      payIcon: "🔞",
      payTitle: "ACESSO +18",
    },
  },
  {
    id: "tempo",
    label: "⏱️ Mais tempo",
    screen: {
      icon: "⏱️",
      title: "SEU TEMPO ACABOU",
      tag: "⏳ CHAMADA EM ESPERA",
      text: "{nome} quer continuar com você. Adicione mais tempo à chamada.",
      button: "⏱️ ADICIONAR TEMPO",
      lockIcon: "⏱️",
      lockBadge: "TEMPO ESGOTADO",
      lockTitle: "ADICIONE MAIS MINUTOS",
      lockText: "Para continuar a chamada com {nome}, adicione mais tempo.",
      feeLabel: "MINUTOS EXTRAS",
      payButton: "⏱️ ADICIONAR AGORA",
      footNote: "Após o pagamento a chamada continua automaticamente",
      payIcon: "⏱️",
      payTitle: "MINUTOS EXTRAS",
    },
  },
  {
    id: "especial",
    label: "💋 Pedido especial",
    screen: {
      icon: "💋",
      title: "PEDIDO ESPECIAL",
      tag: "🔥 SÓ PRA VOCÊ",
      text: "{nome} preparou algo só pra você. Libere para ver agora.",
      button: "🔥 QUERO VER",
      lockIcon: "💋",
      lockBadge: "PEDIDO ESPECIAL",
      lockTitle: "LIBERE O PEDIDO ESPECIAL",
      lockText: "{nome} só mostra isso para quem libera o pedido especial.",
      feeLabel: "PEDIDO ESPECIAL",
      payButton: "🔥 LIBERAR AGORA",
      footNote: "Após o pagamento a chamada continua automaticamente",
      payIcon: "💋",
      payTitle: "PEDIDO ESPECIAL",
    },
  },
];

export function UpsellScreenEditor({ value, onChange }: { value: UpsellScreen | undefined; onChange: (v: UpsellScreen) => void }) {
  const s = value ?? {};
  const set = (patch: Partial<UpsellScreen>) => onChange({ ...s, ...patch });
  const input = (key: keyof UpsellScreen, label: string, placeholder = "", small = false) => (
    <div className="field" style={small ? { maxWidth: 90 } : undefined}>
      <label>{label}</label>
      <input className="input" placeholder={placeholder} value={s[key] ?? ""} onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  );
  return (
    <div>
      <div className="field">
        <label>Modelo (preenche os textos — depois edite como quiser)</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {UPSELL_SCREEN_PRESETS.map((p) => (
            <button key={p.id} type="button" className="btn btn-sm" onClick={() => onChange({ ...p.screen })}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="hint">Use {"{nome}"} para o nome do personagem. Campos vazios usam o texto padrão.</span>
      </div>
      <div className="section-title">1 · Aviso por cima do vídeo</div>
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        {input("icon", "Ícone", "📡", true)}
        <div style={{ flex: 1 }}>{input("title", "Título", "TRANSMISSÃO PAUSADA")}</div>
      </div>
      {input("tag", "Linha em vermelho", "🔒 PARTE EXCLUSIVA")}
      {input("text", "Texto", "A próxima parte da sua chamada com {nome} é exclusiva...")}
      {input("button", "Botão", "🔓 LIBERAR AGORA")}
      <div className="section-title">2 · Card bloqueado</div>
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        {input("lockIcon", "Ícone", "🔒", true)}
        <div style={{ flex: 1 }}>{input("lockBadge", "Selo", "ACESSO BLOQUEADO")}</div>
      </div>
      {input("lockTitle", "Título", "ESTA PARTE ESTÁ BLOQUEADA")}
      {input("lockText", "Texto", "Para continuar no privado com {nome}, libere esta parte.")}
      <div className="grid-2">
        {input("feeLabel", "Nome acima do preço", "nome do produto")}
        {input("feeNote", "Linha abaixo do preço", "Pagamento único via PIX • Acesso imediato")}
      </div>
      <div className="grid-2">
        {input("payButton", "Botão de pagar (o preço entra sozinho)", "🔓 LIBERAR AGORA")}
        {input("footNote", "Rodapé", "Após o pagamento a chamada continua automaticamente")}
      </div>
      <div className="section-title">3 · Pagamento</div>
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        {input("payIcon", "Ícone", "🔄", true)}
        <div style={{ flex: 1 }}>{input("payTitle", "Título", "nome acima do preço")}</div>
      </div>
    </div>
  );
}
