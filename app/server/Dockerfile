# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy root workspace files
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc* ./

# Copy workspace package.json files
COPY app/server/package.json ./app/server/
COPY pkg/core/package.json ./pkg/core/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY pkg/core ./pkg/core
COPY app/server ./app/server

# Build workspace dependencies then the application
RUN cd pkg/core && pnpm run build
RUN cd app/server && pnpm run build

# Runtime stage
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

ENV NODE_ENV=production

# Install pnpm for runtime
RUN corepack enable && corepack prepare pnpm@9 --activate

# Add non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bridge

# Copy root workspace files
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc* ./

# Copy workspace package.json files
COPY app/server/package.json ./app/server/
COPY pkg/core/package.json ./pkg/core/

# Install production dependencies only
RUN pnpm install --prod --no-frozen-lockfile

# Copy built workspace dependency
COPY --from=builder --chown=bridge:nodejs /app/pkg/core/dist ./pkg/core/dist
# Copy built application into workspace path so pnpm node_modules resolve correctly
COPY --from=builder --chown=bridge:nodejs /app/app/server/dist ./app/server/dist
# Copy prisma schema for generation
COPY --from=builder --chown=bridge:nodejs /app/app/server/prisma ./app/server/prisma
# Copy public directory if it exists
COPY --from=builder --chown=bridge:nodejs /app/app/server/public* ./app/server/public/

# Generate prisma client (needs @prisma/client in prod deps + prisma CLI)
RUN cd app/server && pnpm exec prisma generate

# Switch to non-root user
USER bridge

WORKDIR /app/app/server

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server
CMD ["node", "dist/server.js"]