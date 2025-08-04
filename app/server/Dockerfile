# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace files
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc* ./

# Copy app package.json
COPY app/server/package.json ./app/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY app/server ./app/server

# Build the application
RUN cd app/server && pnpm run build

# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install pnpm for runtime
RUN corepack enable && corepack prepare pnpm@latest --activate

# Add non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bridge

# Copy root workspace files
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc* ./

# Copy app package.json
COPY app/server/package.json ./app/server/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built application
COPY --from=builder --chown=bridge:nodejs /app/app/server/dist ./dist
# Copy public directory if it exists
COPY --from=builder --chown=bridge:nodejs /app/app/server/public* ./public/

# Switch to non-root user
USER bridge

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the server
CMD ["node", "dist/index.js"]