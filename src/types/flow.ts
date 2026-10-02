// Tipos compartilhados do Flow Engine (admin + chat público).

export type NodeType =
  | "start"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "question"
  | "buttons"
  | "offer"
  | "delivery"
  | "link"
  | "tag"
  | "end";

export interface DelaySettings {
  /** fixed: usa delayMs; random: sorteia entre delayMinMs e delayMaxMs */
  delayMode?: "fixed" | "random";
  delayMs?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
  /** mostra "● ● ●" durante o delay */
  showTyping?: boolean;
}

export interface ChoiceButton {
  id: string;
  label: string;
}

export interface TextContent {
  text: string;
  /** remetente: personagem (bot) ou mensagem simulada do usuário */
  sender?: "bot" | "user";
}
export interface ImageContent {
  url: string;
  caption?: string;
}
export interface VideoContent {
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  autoplay?: boolean;
}
export interface AudioContent {
  url: string;
  durationSec?: number;
  caption?: string;
}
export interface QuestionContent {
  text: string;
  mode: "open" | "buttons";
  /** onde salvar a resposta aberta: name, email, phone ou chave livre */
  variable?: string;
  placeholder?: string;
  buttons?: ChoiceButton[];
}
export interface ButtonsContent {
  text?: string;
  buttons: ChoiceButton[];
}
export interface OfferContent {
  productId: string;
  headline?: string;
  description?: string;
  ctaLabel?: string;
}
export interface DeliveryContent {
  text?: string;
  productId?: string;
  buttonLabel?: string;
}
export interface LinkContent {
  text?: string;
  url: string;
  buttonLabel?: string;
}
export interface TagContent {
  tagId: string;
}
export interface EndContent {
  text?: string;
}

export interface NodeContentMap {
  start: Record<string, never>;
  text: TextContent;
  image: ImageContent;
  video: VideoContent;
  audio: AudioContent;
  question: QuestionContent;
  buttons: ButtonsContent;
  offer: OfferContent;
  delivery: DeliveryContent;
  link: LinkContent;
  tag: TagContent;
  end: EndContent;
}

export interface FlowNode<T extends NodeType = NodeType> {
  id: string;
  type: T;
  content: NodeContentMap[T];
  settings: DelaySettings & { minimized?: boolean; label?: string };
  position: { x: number; y: number };
  /** conteúdo pago ainda não liberado (apenas no chat público) */
  locked?: boolean;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** "default" | "btn:<buttonId>" | "payment:approved" | "payment:failed" */
  condition: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface RecoverySettings {
  enabled: boolean;
  delayMinutes: number;
  message: string;
  buttonLabel: string;
}

export interface FunnelSettings {
  defaultDelayMs?: number;
  recovery?: RecoverySettings;
}

/** Produto exposto ao front público (sem link de entrega). */
export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  originalPrice: number | null;
  price: number;
  /** checkout externo opcional (link do produto) */
  externalCheckoutUrl: string | null;
}

export interface PublicCharacter {
  name: string;
  avatarUrl: string | null;
  description: string | null;
  status: string;
  showOnline: boolean;
}

export interface PublicFunnel {
  id: string;
  name: string;
  slug: string;
  initialMessage: string | null;
  character: PublicCharacter;
  graph: FlowGraph;
  products: Record<string, PublicProduct>;
  experimentId?: string | null;
  variantId?: string | null;
}

export const DEFAULT_RECOVERY: RecoverySettings = {
  enabled: false,
  delayMinutes: 10,
  message: "Ei... você estava quase lá 👀\n\nSeu acesso ainda está reservado.",
  buttonLabel: "CONTINUAR",
};
