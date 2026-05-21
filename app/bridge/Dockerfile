# syntax=docker/dockerfile:1.7
#
# bridge.lux.network — Vite SPA served by ghcr.io/hanzoai/spa.
# Build context: repo root (pnpm workspace so @luxfi/bridge resolves
# to the sibling pkg/bridge package).

FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat python3 make g++ git
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm -C app/bridge build

FROM ghcr.io/hanzoai/spa
COPY --from=build /app/app/bridge/dist /public
