// Sanitização de conteúdo vindo do visitante ou do painel.
// O React já escapa HTML na renderização; aqui removemos caracteres de controle,
// limitamos tamanho e bloqueamos URLs com esquemas perigosos (javascript:, data: etc.).

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(input: unknown, maxLength = 2000): string {
  if (typeof input !== "string") return "";
  return input.replace(CONTROL_CHARS, "").replace(/<[^>]*>/g, "").trim().slice(0, maxLength);
}

export function sanitizeUrl(input: unknown): string {
  if (typeof input !== "string") return "";
  const url = input.trim();
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url; // caminho local (uploads)
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function sanitizeRecord(input: unknown, maxKeys = 30): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input).slice(0, maxKeys)) {
    const key = k.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40);
    if (key) out[key] = sanitizeText(String(v ?? ""), 500);
  }
  return out;
}
