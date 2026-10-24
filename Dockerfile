# syntax=docker/dockerfile:1

# Eneven Agendamentos Inteligentes: imagem de produção (Easypanel).
# Três estágios: dependências, build (gera ícones, Next standalone e os
# scripts de operação) e a imagem final, enxuta, sem devDependencies.

# ---------- Base ----------
FROM node:24-alpine AS base
# libc6-compat: algumas dependências nativas esperam a glibc.
RUN apk add --no-cache libc6-compat
# pnpm na versão do `packageManager` do package.json.
RUN corepack enable || npm install -g pnpm@12.10.1
WORKDIR /app

# ---------- Dependências (com devDependencies: tsx e esbuild rodam no build) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Instalar aqui, dentro do Alpine, faz o pnpm baixar os binários musl do sharp
# (geração dos ícones) e do @node-rs/argon2.
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM deps AS build
# Endereço público: entra no HTML estático (og:image, canonical). Fica no build
# porque páginas como "/" são geradas aqui. Mude com --build-arg APP_URL=...
ARG APP_URL=https://agenda.eneven.com.br
ENV APP_URL=$APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# `pnpm build` roda o prebuild (ícones em public/brand a partir de marca/) e o next build.
# Os dois scripts de operação saem como arquivos únicos em dist/.
RUN pnpm build && pnpm build:migrate && pnpm build:admin

# ---------- Imagem final ----------
FROM node:24-alpine AS runtime
WORKDIR /app

# Endereço público em tempo de execução (links dos e-mails, retorno do Google).
# ARG não passa de um estágio para o outro, então é declarado de novo aqui. O
# padrão cobre o deploy normal; a variável do Easypanel, se existir, prevalece.
# Em produção a aplicação recusa subir sem APP_URL (ver `appUrl()`).
ARG APP_URL=https://agenda.eneven.com.br
ENV APP_URL=$APP_URL

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Usuário sem privilégios.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

# Servidor standalone (traz o node_modules mínimo, inclusive @node-rs/argon2),
# arquivos estáticos e públicos, migrações SQL, scripts de operação e a entrada.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/scripts/start.sh ./start.sh

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# `sh` dispensa o bit de execução do arquivo.
CMD ["sh", "./start.sh"]
