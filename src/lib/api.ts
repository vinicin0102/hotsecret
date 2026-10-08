import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { ADMIN_COOKIE, hasRole, verifyAdminSession, type AdminSession, type Role } from "./auth";
import { checkRateLimit } from "./rate-limit";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** dados extras na resposta (ex.: erros por campo de um formulário) */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown> | unknown;

/** Roteia por método HTTP e padroniza erros. */
export function apiHandler(handlers: Partial<Record<Method, Handler>>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const handler = handlers[req.method as Method];
    if (!handler) {
      res.setHeader("Allow", Object.keys(handlers).join(", "));
      return res.status(405).json({ error: "Método não permitido" });
    }
    try {
      const result = await handler(req, res);
      if (!res.headersSent) res.status(200).json(result ?? { ok: true });
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof HttpError) return res.status(err.status).json({ ...err.extra, error: err.message });
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Dados inválidos", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
      }
      const code = (err as { code?: string })?.code;
      if (code === "P2002") return res.status(409).json({ error: "Registro duplicado (valor já em uso)." });
      if (code === "P2025") return res.status(404).json({ error: "Registro não encontrado." });
      console.error("[api]", req.method, req.url, err);
      return res.status(500).json({ error: "Erro interno" });
    }
  };
}

export function getClientIp(req: NextApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return ip || req.socket.remoteAddress || "unknown";
}

export function rateLimit(req: NextApiRequest, scope: string, limit: number, windowMs: number) {
  const r = checkRateLimit(`${scope}:${getClientIp(req)}`, limit, windowMs);
  if (!r.ok) throw new HttpError(429, `Muitas requisições. Tente novamente em ${r.retryAfter}s.`);
}

/** Bloqueia requisições de mutação vindas de outra origem (proteção CSRF). */
export function assertSameOrigin(req: NextApiRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.origin;
  if (!origin) return; // requisições não-browser (sem cookies de terceiros)
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Origem não permitida");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Origem inválida");
  }
}

/** Exige sessão administrativa válida e papel mínimo (VIEWER só lê). */
export async function requireAdmin(req: NextApiRequest, role?: Role): Promise<AdminSession> {
  const session = await verifyAdminSession(req.cookies[ADMIN_COOKIE]);
  if (!session) throw new HttpError(401, "Não autenticado");
  assertSameOrigin(req);
  const needed: Role = role ?? (req.method === "GET" ? "VIEWER" : "ADMIN");
  if (!hasRole(session.role, needed)) throw new HttpError(403, "Sem permissão para esta ação");
  return session;
}

export function queryString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Período para filtros: today | 7d | 30d | custom (from/to ISO). */
export function parseRange(query: NextApiRequest["query"]): { from: Date; to: Date; key: string } {
  const range = queryString(query.range) ?? "7d";
  const to = new Date();
  const from = new Date();
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (range === "30d") {
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  } else if (range === "custom") {
    const f = new Date(queryString(query.from) ?? "");
    const t = new Date(queryString(query.to) ?? "");
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) throw new HttpError(400, "Período inválido");
    t.setHours(23, 59, 59, 999);
    return { from: f, to: t, key: range };
  } else {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to, key: range };
}
