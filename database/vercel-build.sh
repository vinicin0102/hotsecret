#!/usr/bin/env bash
# Build na Vercel: aceita a URL do banco com os nomes usados pelas integrações (Neon, Supabase, Vercel Postgres).
set -euo pipefail
export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-${POSTGRES_URL:-}}}"
if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: nenhum banco de dados conectado ao projeto."
  echo "Na Vercel: projeto > Storage > Create Database > Neon (Postgres) > Connect (Production e Preview). Depois faça Redeploy."
  exit 1
fi
npx prisma generate
npx prisma migrate deploy
npx tsx database/seed.ts --if-enabled
npx next build
