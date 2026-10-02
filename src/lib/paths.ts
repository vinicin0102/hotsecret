export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/hot-secret";

/** Prefixa caminhos internos com o basePath (necessário para fetch e assets). */
export function withBase(path: string): string {
  if (!path.startsWith("/")) return path;
  if (path.startsWith(BASE_PATH + "/") || path === BASE_PATH) return path;
  return `${BASE_PATH}${path}`;
}

/** URL absoluta pública (usada em webhooks e links externos). */
export function absoluteUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${withBase(path)}`;
}
