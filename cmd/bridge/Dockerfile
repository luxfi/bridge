# Single-image Lux Bridge: SPA + Go API in one binary.
#
# Stage 1 (ui-build): produce static/ from the bridge UI (app/bridge).
# Stage 2 (go-build): embed static/ via go:embed and produce the binary.
# Stage 3 (final):    distroless runtime, ~25 MB.
#
# Build (from repo root):
#   docker build -f cmd/bridge/Dockerfile -t ghcr.io/luxfi/bridge:dev .

# ── 1. UI build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS ui-build
WORKDIR /ui
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY app/bridge/package.json app/bridge/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY app/bridge/ ./
RUN pnpm build && \
    if [ -d dist ]; then mv dist out; fi

# ── 2. Go build ───────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS go-build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
COPY cmd/ cmd/
# Replace placeholder static/ with the real UI build.
RUN rm -rf cmd/bridge/static && mkdir -p cmd/bridge/static
COPY --from=ui-build /ui/out/ cmd/bridge/static/
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/bridge ./cmd/bridge

# ── 3. Runtime ────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go-build /out/bridge /usr/local/bin/bridge
COPY cmd/bridge/networks.example.yaml /etc/bridge/networks.yaml
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/bridge"]
CMD ["--config=/etc/bridge/networks.yaml", "--addr=:8080"]
