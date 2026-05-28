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
# Build only the workspace deps app/bridge transitively needs whose packages
# declare exports → dist/ (i.e. require a compile to be resolvable). pkg/bridge
# itself ships from src/ (exports point at src/*.ts), so Vite consumes its TS
# directly — no build needed. pkg/utila + pkg/settings + pkg/ui are not in
# app/bridge's dep graph and are intentionally skipped.
RUN pnpm -C pkg/threshold build && pnpm -C pkg/core build
RUN pnpm -C app/bridge build

FROM ghcr.io/hanzoai/spa
COPY --from=build /app/app/bridge/dist /public
