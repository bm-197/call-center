# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @call-center/api.
#
# Final targets:
#   - api:     production API server (`node dist/main.js`)
#   - migrate: one-shot `prisma migrate deploy` runner
#
# Build context MUST be the monorepo root (the call-center/ directory) so
# pnpm-workspace.yaml and all packages are visible. docker-compose.prod.yml
# does this with `context: .`, `dockerfile: apps/api/Dockerfile`.

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.18.3

# ─── 1. base (pnpm enabled) ────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
# OpenSSL is required by the Prisma engine that ships with the CLI for
# `migrate deploy` (the runtime path uses the pg driver adapter and does not
# need it, but bundling it once keeps the migrate stage simple).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ─── 2. deps (cached install of all workspace deps) ────────────────────────
FROM base AS deps
# Copy only manifests + lockfile so this layer caches across source changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json nx.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/amharic/package.json packages/amharic/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─── 3. build (compiles JS for shared/db/amharic/api, generates Prisma) ───
FROM deps AS build
COPY . .
# Generate Prisma client into packages/db/src/generated/prisma. The build
# below compiles those TS files to dist/generated/prisma/ as part of @call-center/db.
RUN pnpm --filter=@call-center/db exec prisma generate
# Build workspace deps + api. nx's targetDefaults dependsOn ['^build'] handles ordering.
RUN pnpm nx run-many -t build -p shared db amharic api

# ─── 4. api-deploy (prune to a self-contained app dir) ─────────────────────
FROM build AS api-deploy
RUN pnpm deploy --prod --legacy --filter=@call-center/api /prod/api

# ─── 5. api runtime ────────────────────────────────────────────────────────
FROM base AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deploy /prod/api ./
RUN chown -R node:node /app
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]

# ─── 6. migrate-deploy (db package + prisma CLI for migrate deploy) ───────
# No --prod here — we need the prisma CLI from db's devDependencies.
FROM build AS migrate-deploy
RUN pnpm deploy --legacy --filter=@call-center/db /prod/db

# ─── 7. migrate runtime (one-shot: applies pending migrations and exits) ─
FROM base AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=migrate-deploy /prod/db ./

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
