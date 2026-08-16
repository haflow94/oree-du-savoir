#!/usr/bin/env sh
set -e

echo "[entrypoint] Application des migrations..."
npx prisma migrate deploy

echo "[entrypoint] Vérification du compte administrateur initial..."
npx tsx prisma/seed.ts

echo "[entrypoint] Démarrage de l'application..."
exec npm run start
