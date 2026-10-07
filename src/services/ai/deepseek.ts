// DeepSeek (API compatível com a da OpenAI). A chave fica só no servidor.
export const DEEPSEEK_MODELS = [
  { id: "deepseek-chat", label: "DeepSeek Chat — rápido e barato (recomendado)" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner — pensa antes de responder (mais lento)" },
] as const;
export type DeepSeekModelId = (typeof DEEPSEEK_MODELS)[number]["id"];
export const DEFAULT_DEEPSEEK_MODEL: DeepSeekModelId = "deepseek-chat";

const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");

export class DeepSeekError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callDeepSeek(input: {
  apiKey: string;
  model: string;
  messages: DeepSeekMessage[];
  /** pede a resposta em JSON (o reasoner não aceita: o formato vai só pelas instruções) */
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; finish: string; usage: { input: number; output: number; cacheRead: number } }> {
  const reasoner = input.model === "deepseek-reasoner";
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
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
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 25_000),
    });
  } catch {
    throw new DeepSeekError(0, "Não foi possível falar com a DeepSeek agora.");
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
  };
  if (!res.ok) throw new DeepSeekError(res.status, data.error?.message ?? `erro ${res.status}`);
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
