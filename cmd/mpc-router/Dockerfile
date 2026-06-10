# mpc-router — family-aware MPC routing proxy (REQUIREMENTS §13.7 G7).
#
# Sits in front of the two MPC backends and dispatches keygen/sign by
# wallet_id family: Solana/TON/XRP → ed25519 backend (mpcd-single),
# EVM/BTC → ECDSA backend (real mpcd / lux-mpc). Required for any deploy
# that serves the ed25519 corridors.
#
# Build (from repo root):
#   docker build -f cmd/mpc-router/Dockerfile -t ghcr.io/luxfi/mpc-router:dev .

# ── 1. Go build ───────────────────────────────────────────────────────────
FROM golang:1.26.3-alpine AS go-build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
# mpc-router imports internal/secrets (token resolution). Copy cmd/ +
# internal/ — same narrow set as cmd/bridge/Dockerfile so a UI or docs
# edit doesn't bust this layer cache.
COPY cmd/ cmd/
COPY internal/ internal/
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/mpc-router ./cmd/mpc-router

# ── 2. Runtime ────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go-build /out/mpc-router /usr/local/bin/mpc-router
USER nonroot:nonroot
EXPOSE 9700
ENTRYPOINT ["/usr/local/bin/mpc-router"]
# Defaults assume mpcd-single on :9900 and real mpcd on :9800 reachable by
# service name; override --eddsa-url / --ecdsa-url / *-token at deploy.
CMD ["--addr=:9700"]
