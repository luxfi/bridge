# syntax=docker/dockerfile:1
# Bridge Server — build from monorepo root:
#   docker build -f app/server/docker/Dockerfile .
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable pnpm

WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/server/package.json ./app/server/
COPY pkg/core/package.json ./pkg/core/

# Install workspace deps
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --no-frozen-lockfile

# Builder stage
FROM node:20-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app

# Copy node_modules from deps, then source on top
COPY --from=deps /app ./
COPY . .

# Build @luxfi/core (workspace dep), then server
RUN cd pkg/core && pnpm build && \
    cd /app/app/server && pnpm run build

# Runner — copy only what we need
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
RUN addgroup --system --gid 1001 bridge && \
    adduser --system --uid 1001 bridge

# Server dist + prisma schema + package.json for module resolution
COPY --from=builder /app/app/server/dist ./dist
COPY --from=builder /app/app/server/package.json ./
COPY --from=builder /app/app/server/prisma ./prisma

# node_modules — pnpm hoists to workspace root, copy both
COPY --from=builder /app/app/server/node_modules ./node_modules
COPY --from=builder /app/node_modules/.pnpm /app/node_modules/.pnpm

USER bridge
EXPOSE 3000
ENV PORT=3000
CMD ["node", "dist/server.js"]
