import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * URL do banco. Integrações da Vercel expõem nomes diferentes (Neon: DATABASE_URL;
 * Supabase: POSTGRES_URL_NON_POOLING / POSTGRES_PRISMA_URL). Com DB_SCHEMA definido,
 * as tabelas ficam em um schema próprio — útil em bancos compartilhados.
 */
export function resolveDatabaseUrl(): string | undefined {
  const base =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
  const schema = process.env.DB_SCHEMA;
  if (!base || !schema || /[?&]schema=/.test(base)) return base;
  return `${base}${base.includes("?") ? "&" : "?"}schema=${encodeURIComponent(schema)}`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
