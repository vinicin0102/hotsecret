export function formatBRL(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type Currency = "BRL" | "MXN" | "ARS";
export const CURRENCIES: Record<Currency, { label: string; locale: string; symbol: string }> = {
  BRL: { label: "Real (R$)", locale: "pt-BR", symbol: "R$" },
  MXN: { label: "Peso mexicano (MXN)", locale: "es-MX", symbol: "$" },
  ARS: { label: "Peso argentino (ARS)", locale: "es-AR", symbol: "$" },
};
export const asCurrency = (v: unknown): Currency => (v === "MXN" || v === "ARS" ? v : "BRL");

/** Valor em centavos na moeda do produto. locale: idioma de exibição (o painel usa pt-BR → "MX$ 199,00"). */
export function formatMoney(cents: number | null | undefined, currency: unknown = "BRL", locale = "pt-BR"): string {
  const c = asCurrency(currency);
  return ((cents ?? 0) / 100).toLocaleString(locale, { style: "currency", currency: c });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function formatPercent(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatTime(d: string | Date): string {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "9,90" | "9.90" | "R$ 1.234,56" → centavos */
export function parseMoneyToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const clean = input.replace(/[^\d,.-]/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
