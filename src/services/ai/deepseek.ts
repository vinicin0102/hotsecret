// DeepSeek e Qwen (Alibaba): APIs compatíveis com a da OpenAI. A chave fica só no servidor.
export const DEEPSEEK_MODELS = [
  { id: "deepseek-chat", label: "DeepSeek Chat — rápido e barato (recomendado)" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner — pensa antes de responder (mais lento)" },
] as const;
export type DeepSeekModelId = (typeof DEEPSEEK_MODELS)[number]["id"];
export const DEFAULT_DEEPSEEK_MODEL: DeepSeekModelId = "deepseek-chat";

/** Qwen pelo Alibaba Cloud Model Studio (internacional, Singapura) */
export const QWEN_MODELS = [
  { id: "qwen-flash", label: "Qwen Flash — rápido e barato (recomendado)" },
  { id: "qwen-plus", label: "Qwen Plus — mais inteligente (mais caro)" },
] as const;
export const DEFAULT_QWEN_MODEL = "qwen-flash";

export type CompatVendor = "deepseek" | "qwen";
export const VENDOR_LABEL: Record<CompatVendor, string> = { deepseek: "DeepSeek", qwen: "Qwen" };

const BASE_URLS: Record<CompatVendor, string> = {
  deepseek: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
  qwen: (process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, ""),
};

export class DeepSeekError extends Error {
  constructor(
    public status: number,
    message: string,
    public vendor: CompatVendor = "deepseek",
  ) {
    super(message);
  }
}

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callDeepSeek(input: {
  /** padrão: DeepSeek */
  vendor?: CompatVendor;
  apiKey: string;
  model: string;
  messages: DeepSeekMessage[];
  /** pede a resposta em JSON (o reasoner não aceita: o formato vai só pelas instruções) */
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; finish: string; usage: { input: number; output: number; cacheRead: number } }> {
  const vendor = input.vendor ?? "deepseek";
  const reasoner = input.model === "deepseek-reasoner";
  let res: Response;
  try {
    res = await fetch(`${BASE_URLS[vendor]}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxTokens ?? 2000,
        stream: false,
        ...(input.json && !reasoner ? { response_format: { type: "json_object" } } : {}),
        // 1.0: natural, mas obediente ao formato e aos ids das ofertas
        ...(!reasoner ? { temperature: 1.0 } : {}),
        // Qwen: sem o modo "pensar" (mais rápido e barato para conversa)
        ...(vendor === "qwen" ? { enable_thinking: false } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 25_000),
    });
  } catch {
    throw new DeepSeekError(0, `Não foi possível falar com a ${VENDOR_LABEL[vendor]} agora.`, vendor);
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
  };
  if (!res.ok) throw new DeepSeekError(res.status, [data.error?.code, data.error?.message].filter(Boolean).join(": ") || `erro ${res.status}`, vendor);
  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    finish: choice?.finish_reason ?? "",
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
      cacheRead: data.usage?.prompt_cache_hit_tokens ?? 0,
    },
  };
}

/** A DeepSeek não aceita mensagens seguidas do mesmo papel: junta as vizinhas. */
export function mergeRoles(messages: DeepSeekMessage[]): DeepSeekMessage[] {
  const out: DeepSeekMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role && m.role !== "system") last.content += `\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}

/** Extrai o objeto JSON da resposta (tolera ```json ... ``` ou texto em volta). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("resposta sem JSON");
  }
}

export function describeDeepSeekError(e: DeepSeekError): string {
  if (e.vendor === "qwen") return describeQwenError(e);
  const m = e.message.toLowerCase();
  if (m.includes("content exists risk") || m.includes("content risk"))
    return "A DeepSeek bloqueou a conversa pelo filtro de conteúdo sensível dela. Deixe a personalidade, o conteúdo e os exemplos sugestivos, sem nada sexual explícito.";
  if (m.includes("model not exist") || m.includes("model_not_found") || m.includes("does not exist"))
    return "A DeepSeek não reconheceu o modelo escolhido. Troque o modelo na Conexão com a IA.";
  if (m.includes("insufficient balance")) return "Sem saldo na DeepSeek — recarregue em platform.deepseek.com.";
  if (e.status === 401) return "Chave da DeepSeek inválida.";
  if (e.status === 402) return "Sem saldo na DeepSeek — recarregue em platform.deepseek.com.";
  if (e.status === 429) return "Limite de uso da DeepSeek atingido. Tente em instantes.";
  if (e.status === 400 || e.status === 422) return `Requisição recusada pela DeepSeek: ${e.message}`;
  if (e.status === 0) return e.message;
  return `A DeepSeek respondeu com erro ${e.status}.`;
}

function describeQwenError(e: DeepSeekError): string {
  const m = e.message.toLowerCase();
  if (m.includes("data_inspection") || m.includes("inappropriate"))
    return "O Qwen bloqueou a conversa pelo filtro de conteúdo dele. Deixe a personalidade, o conteúdo e os exemplos sugestivos, sem nada sexual explícito.";
  if (m.includes("arrearage") || m.includes("good standing") || m.includes("overdue")) return "Conta do Alibaba Cloud sem saldo ou com pagamento pendente — confira em modelstudio.console.alibabacloud.com.";
  if (m.includes("model_not_found") || m.includes("model not exist") || m.includes("does not exist")) return "O Qwen não reconheceu o modelo escolhido. Troque o modelo na Conexão com a IA.";
  if (e.status === 401 || m.includes("invalid_api_key") || m.includes("invalid api-key"))
    return "Chave do Qwen inválida. Crie a chave no Model Studio internacional (região Singapura) — chaves da China não funcionam aqui.";
  if (e.status === 403) return "A chave do Qwen não tem acesso a este modelo (ative o modelo no Model Studio).";
  if (e.status === 429) return "Limite de uso do Qwen atingido. Tente em instantes.";
  if (e.status === 400) return `Requisição recusada pelo Qwen: ${e.message}`;
  if (e.status === 0) return e.message;
  return `O Qwen respondeu com erro ${e.status}.`;
}
