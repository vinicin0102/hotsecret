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

export const PALETTE: NodeType[] = ["text", "image", "video", "audio", "question", "buttons", "offer", "delivery", "link", "tag", "end"];

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

export function makeNode(type: NodeType, position: { x: number; y: number }): FlowNode {
  return {
    id: shortId("n"),
    type,
    content: defaultContent(type),
    // atraso herdado do fluxo (⚙ Configurar → Tempo entre mensagens)
    settings: { delayMode: "inherit", showTyping: type !== "tag" },
    position,
  };
}
