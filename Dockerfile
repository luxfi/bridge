# Build stage
FROM node:20-alpine AS builder

# Install dependencies for building
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Build the bridge application
RUN pnpm build:bridge

# Production stage
FROM node:20-alpine

RUN apk add --no-cache --upgrade bash

WORKDIR /app

# Install pnpm and serve globally
RUN npm install -g pnpm serve

# Copy built application from builder
COPY --from=builder /app/app/bridge/.next ./app/bridge/.next
COPY --from=builder /app/app/bridge/public ./app/bridge/public
COPY --from=builder /app/app/bridge/package.json ./app/bridge/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production dependencies
RUN pnpm install --prod --frozen-lockfile

# Expose port
EXPOSE 3000

# Set working directory to the bridge app
WORKDIR /app/app/bridge

# Start the Next.js application
CMD ["pnpm", "start"]