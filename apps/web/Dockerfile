# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @call-center/web (Next.js 16, App Router).
#
# Build context = monorepo root. Compose:
#   build: { context: ., dockerfile: apps/web/Dockerfile }
#
# Final image runs Next's standalone server.js. Tracing is enabled via
# `outputFileTracingRoot` in next.config.ts so workspace packages
# (@call-center/shared) are included.

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.18.3

# ─── 1. base ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

# ─── 2. deps ───────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json nx.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/amharic/package.json packages/amharic/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm nx build web

# ─── 4. runtime (Next standalone server) ───────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

# Standalone trace output already includes a pruned node_modules and
# server.js. Static assets must be copied alongside. There's no apps/web/public
# directory in this repo today; if one is added, copy it here too:
#   COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
