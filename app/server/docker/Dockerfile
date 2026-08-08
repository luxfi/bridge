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

# The root package.json runs `node scripts/patch-hanzogui-exports.cjs` on
# postinstall, so the install fails outright without it:
#   Error: Cannot find module '/app/scripts/patch-hanzogui-exports.cjs'
# The script itself is a UI concern this image has no use for, but it is copied
# rather than skipped with --ignore-scripts: that flag would also drop
# @prisma/client's own postinstall, and it would make the image's install a
# second, subtly different install from the one everyone runs locally. It guards
# every path with existsSync, so with none of those packages present it is a
# no-op. 64K.
COPY scripts ./scripts

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

# Runner — keep the workspace layout
FROM node:20-alpine
WORKDIR /app/app/server

ENV NODE_ENV=production
RUN addgroup --system --gid 1001 bridge && \
    adduser --system --uid 1001 bridge

# EVERY PATH BELOW MATTERS. pnpm links dependencies with RELATIVE symlinks that
# count directories from where they sit:
#   app/server/node_modules/express      -> ../../../node_modules/.pnpm/express@…
#   app/server/node_modules/@luxfi/core  -> ../../../../pkg/core
# Flattening app/server/node_modules into /app/node_modules — which this used to
# do — moves every one of those links two directories too high, so they resolve
# above the filesystem root and the very first require fails:
#   Error: Cannot find module 'express'
#   Require stack: - /app/dist/server.js
# The image built and pushed perfectly well and then could not start. So the
# layout is reproduced exactly rather than tidied, and WORKDIR moves to meet it.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/pkg /app/pkg
COPY --from=builder /app/app/server/node_modules ./node_modules
COPY --from=builder /app/app/server/dist ./dist
COPY --from=builder /app/app/server/package.json ./
COPY --from=builder /app/app/server/prisma ./prisma

USER bridge
EXPOSE 3000
ENV PORT=3000
CMD ["node", "dist/server.js"]
