#!/usr/bin/env bash
set -euo pipefail

echo "[Worker] Generando cliente Prisma..."
npx prisma generate

echo "[Worker] Verificando esquema..."
npx prisma db push

echo "[Worker] Iniciando scheduler..."
exec npm run worker