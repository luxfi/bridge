# mpcd-single — single-signer HKDF-per-wallet ed25519 mpcd.
#
# The ed25519 backend behind mpc-router. Signs Solana/TON/XRP from one
# master seed (32 bytes, loaded via internal/secrets). NOT threshold
# custody — treat the master seed like an HSM-backed hot wallet. See
# cmd/mpcd-single/main.go and REQUIREMENTS §13.7 (cluster-FROST is the
# longer-term replacement).
#
# Build (from repo root):
#   docker build -f cmd/mpcd-single/Dockerfile -t ghcr.io/luxfi/mpcd-single:dev .

# ── 1. Go build ───────────────────────────────────────────────────────────
FROM golang:1.26.3-alpine AS go-build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
# mpcd-single imports internal/secrets + internal/solanarpc. Copy cmd/ +
# internal/ — same narrow set as cmd/bridge & cmd/mpc-router.
COPY cmd/ cmd/
COPY internal/ internal/
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/mpcd-single ./cmd/mpcd-single

# ── 2. Runtime ────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go-build /out/mpcd-single /usr/local/bin/mpcd-single
USER nonroot:nonroot
EXPOSE 9900
ENTRYPOINT ["/usr/local/bin/mpcd-single"]
# In production, pre-provision the master seed (kms: URI or a mounted
# Secret) and drop --auto-create-seed. The default here is dev-only.
CMD ["--addr=:9900"]
