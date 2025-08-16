# Bridge Dockerfile - pnpm monorepo
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/
COPY apps/*/package.json ./apps/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Builder stage
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/
COPY --from=deps /app/apps/*/node_modules ./apps/
COPY . .

# Build all packages
RUN pnpm build:all

# Runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bridge

# Copy built application
COPY --from=builder /app/apps/bridge/dist ./dist
COPY --from=builder /app/apps/bridge/package.json ./
COPY --from=builder /app/node_modules ./node_modules

USER bridge

EXPOSE 3000

CMD ["node", "dist/index.js"]