# Bridge - Next.js standalone build
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/bridge/package.json ./app/bridge/
COPY pkg/core/package.json ./pkg/core/
COPY pkg/settings/package.json ./pkg/settings/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Builder stage
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/app/bridge/node_modules ./app/bridge/node_modules
COPY --from=deps /app/pkg/core/node_modules ./pkg/core/node_modules 2>/dev/null || true
COPY --from=deps /app/pkg/settings/node_modules ./pkg/settings/node_modules 2>/dev/null || true
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max_old_space_size=4096

WORKDIR /app/app/bridge
RUN pnpm build

# Runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bridge

COPY --from=builder /app/app/bridge/public ./public
COPY --from=builder --chown=bridge:nodejs /app/app/bridge/.next/standalone ./
COPY --from=builder --chown=bridge:nodejs /app/app/bridge/.next/static ./app/bridge/.next/static

USER bridge

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "app/bridge/server.js"]
