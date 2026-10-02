// Sessões assinadas (JWT HS256) — funciona no Edge (middleware) e no Node (API routes).
import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE = "hs_admin";
const ADMIN_TTL_SECONDS = 60 * 60 * 12; // 12h

export type Role = "OWNER" | "ADMIN" | "VIEWER";

export interface AdminSession {
  uid: string;
  role: Role;
  email: string;
}

export interface LeadSession {
  leadId: string;
  conversationId: string;
  funnelId: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres).");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-dev-only-insecure-secret");
  }
  return new TextEncoder().encode(secret);
}

export async function signAdminSession(s: AdminSession): Promise<string> {
  return new SignJWT({ role: s.role, email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.uid)
    .setAudience("admin")
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyAdminSession(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "admin" });
    return { uid: String(payload.sub), role: payload.role as Role, email: String(payload.email) };
  } catch {
    return null;
  }
}

export function adminCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const path = process.env.NEXT_PUBLIC_BASE_PATH || "/";
  return `${ADMIN_COOKIE}=${token}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${ADMIN_TTL_SECONDS}${secure}`;
}

export function clearAdminCookie(): string {
  const path = process.env.NEXT_PUBLIC_BASE_PATH || "/";
  return `${ADMIN_COOKIE}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Token do visitante: amarra lead + conversa + fluxo, impedindo manipular dados de outros leads. */
export async function signLeadToken(s: LeadSession): Promise<string> {
  return new SignJWT({ cid: s.conversationId, fid: s.funnelId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.leadId)
    .setAudience("lead")
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secretKey());
}

export async function verifyLeadToken(token: unknown): Promise<LeadSession | null> {
  if (typeof token !== "string" || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "lead" });
    return { leadId: String(payload.sub), conversationId: String(payload.cid), funnelId: String(payload.fid) };
  } catch {
    return null;
  }
}

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, ADMIN: 1, OWNER: 2 };
export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
