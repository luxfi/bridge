# syntax=docker/dockerfile:1.7
#
# bridge.lux.network — Vite SPA.
#
# Build context: repo root (pnpm workspace so @luxfi/bridge resolves
# to the sibling pkg/bridge package).
#
# Runtime config: nginx serves the static bundle and a templated
# /__ENV.js generated at container boot from BRIDGE_* env vars. The
# bundle's bridge.config.ts reads window.__ENV (populated by
# /__ENV.js) before falling back to Vite's build-time import.meta.env.
# This makes the image env-agnostic: one tag deployed to N envs.

FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat python3 make g++ git
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm -C app/bridge build

FROM nginx:alpine
COPY --from=build /app/app/bridge/dist /usr/share/nginx/html
COPY app/bridge/docker-entrypoint.sh /docker-entrypoint.d/40-render-env.sh
RUN chmod +x /docker-entrypoint.d/40-render-env.sh
