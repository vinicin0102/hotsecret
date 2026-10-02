#!/usr/bin/env bash
# Build na Vercel: aceita a URL do banco com os nomes usados pelas integrações (Neon, Supabase, Vercel Postgres).
set -euo pipefail
BASE_URL="${DATABASE_URL:-${POSTGRES_URL_NON_POOLING:-${POSTGRES_PRISMA_URL:-${POSTGRES_URL:-}}}}"
if [ -z "$BASE_URL" ]; then
  echo "ERRO: nenhum banco de dados conectado ao projeto."
  echo "Na Vercel: projeto > Storage > Create Database > Neon (Postgres) > Connect (Production e Preview). Depois faça Redeploy."
  exit 1
fi
# DB_SCHEMA: tabelas em schema próprio (evita conflito com bancos já em uso)
if [ -n "${DB_SCHEMA:-}" ] && [[ "$BASE_URL" != *"schema="* ]]; then
  if [[ "$BASE_URL" == *"?"* ]]; then BASE_URL="${BASE_URL}&schema=${DB_SCHEMA}"; else BASE_URL="${BASE_URL}?schema=${DB_SCHEMA}"; fi
fi
export DATABASE_URL="$BASE_URL"
npx prisma generate
npx prisma migrate deploy
npx tsx database/seed.ts --if-enabled
npx next build
