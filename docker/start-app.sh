#!/usr/bin/env bash
set -euo pipefail

echo "[App] Generando cliente Prisma..."
npx prisma generate

echo "[App] Sincronizando esquema..."
npx prisma db push

echo "[App] Ejecutando seed idempotente..."
npx prisma db seed

echo "[App] Iniciando Next.js en 0.0.0.0:${PORT:-3000}..."
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"