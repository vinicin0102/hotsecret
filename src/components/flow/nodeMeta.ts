import type { FlowNode, NodeContentMap, NodeType } from "@/types/flow";
import { shortId } from "@/features/chat-engine/engine";

export const NODE_META: Record<NodeType, { label: string; icon: string; color: string; hint: string }> = {
  start: { label: "Início", icon: "★", color: "#D8A85C", hint: "Ponto de entrada da conversa" },
  text: { label: "Mensagem", icon: "✉", color: "#D94F7D", hint: "Texto com delay e digitando" },
  image: { label: "Imagem", icon: "▣", color: "#F29AB8", hint: "Foto com legenda" },
  video: { label: "Vídeo", icon: "▶", color: "#F29AB8", hint: "Vídeo com thumbnail" },
  audio: { label: "Áudio", icon: "♪", color: "#F29AB8", hint: "Mensagem de voz" },
  question: { label: "Pergunta", icon: "?", color: "#C92F56", hint: "Resposta aberta ou botões" },
  buttons: { label: "Resposta", icon: "◉", color: "#C92F56", hint: "O lead responde e o fluxo segue o caminho certo" },
  offer: { label: "Oferta", icon: "◇", color: "#D8A85C", hint: "Card de produto + checkout" },
  delivery: { label: "Entrega", icon: "🔓", color: "#3DDC84", hint: "Libera o acesso após pagamento" },
  link: { label: "Link", icon: "↗", color: "#B9AAB3", hint: "Botão para um link externo" },
  tag: { label: "Tag", icon: "#", color: "#B9AAB3", hint: "Aplica uma tag ao lead" },
  end: { label: "Fim", icon: "■", color: "#7F6E79", hint: "Encerra a conversa" },
};

export interface PaletteItem {
  key: string;
  type: NodeType;
  label: string;
  icon: string;
  color: string;
  hint: string;
  /** ajustes no conteúdo padrão do bloco */
  content?: () => Record<string, unknown>;
}

const item = (type: NodeType, extra: Partial<PaletteItem> = {}): PaletteItem => ({ key: type, type, ...NODE_META[type], ...extra });

export const PALETTE: PaletteItem[] = [
  item("text"),
  item("image"),
  item("video"),
  item("audio"),
  item("question"),
  item("buttons", { label: "Resposta digitada", hint: "O lead digita o que quiser e o fluxo segue pelas palavras-chave" }),
  item("buttons", {
    key: "buttons-click",
    label: "Botões",
    icon: "▤",
    hint: "O lead escolhe clicando em um botão — cada botão leva a um caminho (ex.: ofertas diferentes)",
    content: () => ({
      text: "O que você prefere?",
      inputMode: "click",
      buttons: [
        { id: shortId("b"), label: "Opção 1" },
        { id: shortId("b"), label: "Opção 2" },
      ],
    }),
  }),
  item("offer"),
  item("delivery"),
  item("link"),
  item("tag"),
  item("end"),
];

/** Nome exibido no canvas: blocos de resposta só com botões aparecem como "Botões". */
export function nodeLabel(n: FlowNode): string {
  return n.settings?.label || nodeTypeLabel(n);
}

export function nodeTypeLabel(n: FlowNode): string {
  const c = n.content as { inputMode?: string; mode?: string };
  if (n.type === "buttons") return c.inputMode === "click" ? "Botões" : c.inputMode === "both" ? "Resposta / botões" : "Resposta";
  return NODE_META[n.type].label;
}

export function defaultContent<T extends NodeType>(type: T): NodeContentMap[T] {
  const map: { [K in NodeType]: NodeContentMap[K] } = {
    start: {} as never,
    text: { text: "Nova mensagem...", sender: "bot" },
    image: { url: "", caption: "" },
    video: { url: "", thumbnailUrl: "", caption: "", autoplay: false },
    audio: { url: "", caption: "" },
    question: { text: "Qual é o seu nome?", mode: "open", variable: "name", placeholder: "Digite aqui..." },
    buttons: {
      text: "Você quer descobrir?",
      inputMode: "type",
      buttons: [
        { id: shortId("b"), label: "Sim", keywords: "quero, claro, pode, bora" },
        { id: shortId("b"), label: "Não", keywords: "agora nao, depois" },
      ],
    },
    offer: { productId: "", headline: "", description: "", ctaLabel: "QUERO ACESSAR ❤️" },
    delivery: { text: "Pronto! ❤️ Seu acesso foi liberado.", buttonLabel: "ACESSAR MEU PRODUTO" },
    link: { text: "", url: "https://", buttonLabel: "Abrir" },
    tag: { tagId: "" },
    end: { text: "" },
  };
  return structuredClone(map[type]);
}

export function makeNode(type: NodeType, position: { x: number; y: number }, content?: Record<string, unknown>): FlowNode {
  return {
    id: shortId("n"),
    type,
    content: { ...defaultContent(type), ...(content ?? {}) } as FlowNode["content"],
    // atraso herdado do fluxo (⚙ Configurar → Tempo entre mensagens)
    settings: { delayMode: "inherit", showTyping: type !== "tag" },
    position,
  };
}
