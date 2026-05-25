# syntax=docker/dockerfile:1.7
#
# Bridge — Vite 8 SPA served by ghcr.io/hanzoai/spa.
# Build context: repo root (pnpm workspace).

FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat python3 make g++ git
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile
RUN pnpm -C app/bridge build

FROM ghcr.io/hanzoai/spa
COPY --from=build /app/app/bridge/dist /public
