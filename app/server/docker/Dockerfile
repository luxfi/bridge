# syntax=docker/dockerfile:1
# Bridge Server — build from monorepo root:
#   docker build -f app/server/docker/Dockerfile .
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable pnpm

WORKDIR /app

# Copy workspace root config, plus a manifest for every workspace package
# app/server depends on. pnpm resolves `workspace:` ranges against the manifests
# present in the tree, so a missing one is not a slow fallback to the registry —
# it is a hard failure:
#   ERR_PNPM_WORKSPACE_PKG_NOT_FOUND  In app/server: "@luxfi/utila@workspace:^"
#   is in the dependencies but no package named "@luxfi/utila" is present
# which is what this image did for every build after app/server took the utila
# dependency. Keep this list in step with app/server/package.json.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/server/package.json ./app/server/
COPY pkg/core/package.json ./pkg/core/
COPY pkg/utila/package.json ./pkg/utila/

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

# Build the workspace deps, then the server. Both resolve to files under their
# own dist/, which is gitignored — @luxfi/utila's package.json points main at
# ./dist/index.cjs.js — so an unbuilt dep is a module-not-found at container
# start rather than at build time. domain/utila.ts and domain/cosigners.ts
# import it for real (createGrpcClient, serviceAccountAuthStrategy), so it is
# needed at runtime and not merely for types.
RUN cd pkg/core && pnpm build && \
    cd /app/pkg/utila && pnpm build && \
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
