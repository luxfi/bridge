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
COPY tsconfig.base.json ./
COPY .npmrc* ./

# Copy all workspace package.json files for dependency resolution
COPY app/bridge/package.json ./app/bridge/
COPY pkg/core/package.json ./pkg/core/
COPY pkg/settings/package.json ./pkg/settings/
COPY pkg/threshold/package.json ./pkg/threshold/
COPY pkg/ui/package.json ./pkg/ui/
COPY pkg/utila/package.json ./pkg/utila/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code (packages first, then app)
COPY pkg ./pkg
COPY app/bridge ./app/bridge

# Set Next.js to standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
ENV STANDALONE=true

# Dummy Firebase env vars for build-time module initialization
ENV NEXT_PUBLIC_FIREBASE_API_KEY=build-placeholder
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=build-placeholder.firebaseapp.com
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=build-placeholder
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=build-placeholder.appspot.com
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
ENV NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:placeholder
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-PLACEHOLDER
ENV NEXT_PUBLIC_IDENTITY_API=https://identity.lux.network

# Build the application with increased heap
RUN cd app/bridge && NODE_OPTIONS="--max_old_space_size=4096" pnpm run build

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

# Start the application (standalone output places server.js under app/bridge/ due to outputFileTracingRoot)
CMD ["node", "app/bridge/server.js"]