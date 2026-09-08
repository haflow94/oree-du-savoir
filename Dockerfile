# Image de production. Basée sur Debian (bookworm-slim) plutôt qu'Alpine :
# cible de déploiement = serveur Linux headless Debian, et évite les
# incompatibilités connues entre les moteurs Prisma et musl/Alpine.

FROM node:22-bookworm-slim AS base
# chromium : moteur de génération PDF des dossiers d'inscription (voir
# src/lib/dossier/browser.ts) — paquet système plutôt que le téléchargement
# intégré de Puppeteer, pour ne pas dépendre du réseau à l'installation et
# suivre les mises à jour de sécurité du navigateur via apt.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates chromium \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Le conteneur tourne en "node" (uid/gid 1000, voir docker-compose.yml
# `user: "1000:1000"`), mais chaque COPY --from ci-dessus a copié les
# fichiers appartenant à root (comportement par défaut de COPY) : sans ce
# chown, Next.js ne peut pas créer /app/.next/cache/images/ à la demande
# (cache d'optimisation d'image, créé au premier accès, pas au build) et
# échoue avec EACCES à chaque image optimisée — constaté en production le
# 2026-09-08 (voir bilan de clôture).
RUN chown -R node:node /app

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
