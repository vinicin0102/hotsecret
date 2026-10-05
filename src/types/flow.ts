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
  | "end"
  | "ai";

/**
 * inherit: usa o atraso padrão do fluxo · fixed: delayMs · random: entre delayMinMs e delayMaxMs ·
 * auto: proporcional ao tamanho do texto (como alguém digitando)
 */
export type DelayMode = "inherit" | "fixed" | "random" | "auto";

export interface DelaySettings {
  delayMode?: DelayMode;
  delayMs?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
  /** mostra "● ● ●" durante o delay */
  showTyping?: boolean;
}

export interface ChoiceButton {
  id: string;
  label: string;
  /** palavras/frases alternativas que também levam a este caminho (separadas por vírgula) */
  keywords?: string;
}

/** type: o lead digita (padrão) · both: digita ou clica · click: só botões */
export type AnswerInputMode = "type" | "both" | "click";

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
  /** visualização única: o lead assiste uma vez e o link só é liberado pelo servidor no play */
  viewOnce?: boolean;
  /** (mensagem salva) vídeo de visualização única já aberto */
  viewed?: boolean;
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
  inputMode?: AnswerInputMode;
}
export interface ButtonsContent {
  text?: string;
  buttons: ChoiceButton[];
  inputMode?: AnswerInputMode;
  placeholder?: string;
}
export interface OfferContent {
  productId: string;
  headline?: string;
  description?: string;
  ctaLabel?: string;
  /** card: card de compra · call: chamada de vídeo recebida (Atender gera o PIX, Recusar segue "Recusou a chamada") */
  style?: "card" | "call";
  /** vídeo da chamada (aba Vídeos) */
  videoId?: string;
  /** chamada: produto oferecido quando o lead recusa (ex.: chamada mais curta e mais barata) */
  downsellProductId?: string;
  /** chamada: texto do pop-up do downsell */
  downsellText?: string;
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
/** Cérebro: a IA conversa com o lead (texto livre) e pode mostrar ofertas e mandar áudios do cérebro. */
export interface AiContent {
  brainId: string;
  /** objetivo deste ponto da conversa */
  goal?: string;
  /** wait: espera o lead escrever · ai: a IA puxa a conversa */
  startMode?: "wait" | "ai";
  placeholder?: string;
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
  ai: AiContent;
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

/** Atraso padrão das mensagens do fluxo. */
export interface FunnelDelay {
  mode: "fixed" | "random" | "auto";
  ms?: number;
  minMs?: number;
  maxMs?: number;
}

export const DEFAULT_FUNNEL_DELAY: FunnelDelay = { mode: "auto" };

/** IDs públicos dos pixels (vão ao navegador). Tokens secretos ficam só no servidor. */
export interface TrackingIds {
  metaPixelId?: string;
  tiktokPixelId?: string;
  googleTagId?: string;
}

/** Aparência do chat */
export interface ChatAppearance {
  /** vídeo em loop (mudo) atrás da conversa; os balões ficam transparentes */
  bgVideoUrl?: string;
  /** escurecimento do vídeo de fundo, 0–90 (%) */
  bgDim?: number;
}

export interface FunnelSettings {
  defaultDelayMs?: number;
  appearance?: ChatAppearance;
  /** pixels deste fluxo (vazio = usa os pixels padrão de Configurações) */
  tracking?: TrackingIds;
  delay?: FunnelDelay;
  recovery?: RecoverySettings;
}

/** Produto exposto ao front público (sem link de entrega). */
export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** vídeo de prévia do produto */
  videoUrl?: string | null;
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
  delay?: FunnelDelay;
  tracking?: TrackingIds;
  appearance?: ChatAppearance;
}

export const DEFAULT_RECOVERY: RecoverySettings = {
  enabled: false,
  delayMinutes: 10,
  message: "Ei... você estava quase lá 👀\n\nSeu acesso ainda está reservado.",
  buttonLabel: "CONTINUAR",
};
