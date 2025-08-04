# Lux Bridge

Bridge monorepo for Lux Network - a decentralized cross-chain bridge using Multi-Party Computation (MPC) for secure asset transfers.

## Prerequisites

- Node.js v20+
- pnpm v9.15.0+
- Go 1.22+ (for MPC tools)
- Docker (for infrastructure services)

## Quick Start

### 1. Install Dependencies

```bash
# Install pnpm if needed
npm install -g pnpm

# Install project dependencies
pnpm install

# Install MPC tools via Go
make install-mpc
```

### 2. Start Infrastructure

```bash
# Start infrastructure services (Lux ID, KMS, databases, etc.)
make up
```

This starts:
- **Lux ID** (Casdoor) - Port 8000 - Unified authentication
- **KMS** (Vault) - Port 8200 - Key management
- **NATS** - Port 4223 - Messaging
- **Consul** - Port 8501 - Service discovery
- **PostgreSQL** - Port 5433 - Bridge database
- **Lux ID DB** - Port 5434 - Auth database

### 3. Start MPC Network

```bash
# Start 3-node MPC network
make start-mpc-nodes
```

This runs MPC nodes on:
- Node 0: HTTP 6000, gRPC 9090
- Node 1: HTTP 6001, gRPC 9091
- Node 2: HTTP 6002, gRPC 9092

### 4. Start Application Services

In separate terminals:

```bash
# Terminal 1: Bridge API Server
cd app/server && pnpm dev

# Terminal 2: Bridge UI
cd app/bridge && pnpm dev
```

### 5. Access Services

- Bridge UI: http://localhost:3000
- Bridge API: http://localhost:5000
- Lux ID Admin: http://localhost:8000
- Consul UI: http://localhost:8501

## Architecture

```
Bridge UI → Bridge Server → MPC Nodes → Blockchain Networks
                               ↓
                    KMS + Lux ID + Consul
```

## Key Features

- **MPC Security**: 2-of-3 threshold signatures
- **Multi-Chain**: Support for EVM and non-EVM chains
- **Unified Auth**: Lux ID (Casdoor) integration
- **Key Management**: Secure key storage in KMS
- **Service Discovery**: Consul for dynamic configuration

## Development

```bash
# Run tests
pnpm test

# Check MPC status
lux-mpc-cli status --url http://localhost:6000

# View logs
tail -f logs/mpc-node-0.log

# Stop services
make stop-mpc-nodes  # Stop MPC
make down           # Stop infrastructure
```

## Documentation

- [MPC Go Integration](docs/MPC-GO-INTEGRATION.md)
- [Lux ID Integration](docs/LUX-ID-INTEGRATION.md)
- [CI/CD Docker Images](docs/CI-CD-DOCKER-IMAGES.md)

## Tips

Since "pnpm" is a finger twister, many people alias it to "pn". For example, with `bash`, put `alias pn='pnpm'` in `.bashrc`.
