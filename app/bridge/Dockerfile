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
COPY app/bridge/package.json ./app/bridge/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY app/bridge ./app/bridge

# Set Next.js to standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
ENV STANDALONE=true

# Build the application
RUN cd app/bridge && pnpm run build

# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Add non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/app/bridge/public ./public
COPY --from=builder /app/app/bridge/package.json ./package.json

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/app/bridge/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/app/bridge/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the application
CMD ["node", "server.js"]