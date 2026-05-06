# lux-bridge

Single-image bridge: SPA + API in one Go binary.

## Why

The legacy stack (Node API + React UI + Postgres + Prisma) is many moving parts. This binary collapses the read-path (networks, tokens, exchanges, limits) into a Go service that needs zero database. Heavy paths (quote, rate, swaps, explorer) reverse-proxy to the existing Node backend until the native port lands; pointing them away is a one-flag change.

## Run

```
go build -o bridge ./cmd/bridge
./bridge --config cmd/bridge/networks.example.yaml --backend http://localhost:5000
```

Routes:

| Path | Source |
| --- | --- |
| `/` | embedded SPA (or `--static <dir>` to override) |
| `/envs.js` | runtime config (`window.ENV`) |
| `/health` | service health |
| `/v1/bridge/networks` | YAML config |
| `/v1/bridge/tokens` | YAML config (filterable by `?network=`) |
| `/v1/bridge/exchanges` | YAML config |
| `/v1/bridge/limits` | YAML config |
| `/v1/bridge/quote` | proxied → Node backend |
| `/v1/bridge/rate` | proxied |
| `/v1/bridge/swaps` | proxied |
| `/v1/bridge/explorer/*` | proxied |
| `/v1/bridge/settings` | proxied |

Without `--backend`, proxied routes return `503 backend_unavailable`.

## Build the image

```
docker build -f cmd/bridge/Dockerfile -t ghcr.io/luxfi/bridge:dev .
```

The Dockerfile builds the UI from `app/bridge/` and embeds it into the Go binary. Final image is distroless (~25 MB).

## Migration plan

The Node backend's `swaps`, `quote`, `rate`, `mpc-bridge`, `teleport-processor`, and `mpc-service` modules — plus the Prisma schema (`Network`, `Currency`, `Swap`, `Transaction`, `Quote`, `RpcNode`) — are next to port. Target storage is Hanzo Base (SQLite-embedded). MPC orchestration calls `github.com/luxfi/mpc` directly.
