# Single-image Lux Bridge: SPA + Go API in one binary.
#
# Stage 1 (ui-build): produce static/ from the bridge UI (app/bridge).
# Stage 2 (go-build): embed static/ via go:embed and produce the binary.
# Stage 3 (final):    distroless runtime, ~25 MB.
#
# Build (from repo root):
#   docker build -f cmd/bridge/Dockerfile -t ghcr.io/luxfi/bridge:dev .

# ── 1. UI build ───────────────────────────────────────────────────────────
# Build context: repo root (pnpm workspace). app/bridge depends on
# @luxfi/bridge via `workspace:*`, so the whole monorepo must be in scope
# for pnpm to resolve the sibling package.
FROM node:20-alpine AS ui-build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm -C app/bridge build && \
    cp -r app/bridge/dist /ui-out

# ── 2. Go build ───────────────────────────────────────────────────────────
FROM golang:1.26.4-alpine AS go-build
WORKDIR /src
RUN apk add --no-cache git ca-certificates tzdata \
    && echo 'nonroot:x:65532:65532:nonroot:/home/nonroot:/sbin/nologin' >> /etc/passwd \
    && echo 'nonroot:x:65532:' >> /etc/group
# Private-module auth for github.com/hanzoai/zip (the only non-public dep).
# Build-time only: the final stage is FROM scratch and copies just the binary,
# so GH_TOKEN never ships in the published image. In CI, pass from a KMS secret.
ARG GH_TOKEN=""
ENV GOPRIVATE=github.com/hanzoai
RUN if [ -n "$GH_TOKEN" ]; then \
      git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"; \
    fi
COPY go.mod go.sum* ./
RUN go mod download
# The binary spans cmd/bridge, the internal/ subpackages it imports, and
# the root package (profile.go). Keep this list narrow — copying the whole
# repo would bust the layer cache on every UI edit.
COPY cmd/ cmd/
COPY internal/ internal/
COPY profile.go ./
# Replace placeholder static/ with the real UI build.
RUN rm -rf cmd/bridge/static && mkdir -p cmd/bridge/static
COPY --from=ui-build /ui-out/ cmd/bridge/static/
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/bridge ./cmd/bridge

# ── 3. Runtime ────────────────────────────────────────────────────────────
FROM scratch
COPY --from=go-build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=go-build /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=go-build /etc/passwd /etc/passwd
COPY --from=go-build /etc/group /etc/group
COPY --from=go-build /out/bridge /usr/local/bin/bridge
COPY cmd/bridge/networks.example.yaml /etc/bridge/networks.yaml
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/bridge"]
CMD ["--config=/etc/bridge/networks.yaml", "--addr=:8080"]
