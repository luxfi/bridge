# Lux Bridge - AI Assistant Knowledge Base

**Last Updated**: 2024-11-12
**Project**: Lux Bridge
**Organization**: Lux Network

## Project Overview

The Lux Bridge is a decentralized cross-chain bridge infrastructure that enables secure, trustless asset transfers between multiple blockchain networks using Multi-Party Computation (MPC) technology. It serves as the primary interoperability layer for the Lux ecosystem, connecting 15+ blockchain networks.

## Architecture Summary

### Core Technology Stack
- **MPC Framework**: 2-of-3 threshold signature scheme using `github.com/luxfi/mpc`
- **Frontend**: Next.js 14 with TypeScript, React 18, TailwindCSS
- **Backend**: Node.js API server with Express
- **Smart Contracts**: Solidity (OpenZeppelin), deployed on multiple chains
- **Infrastructure**: Docker, Kubernetes, PostgreSQL, NATS, Consul, Vault (KMS)
- **Authentication**: Lux ID (Casdoor) for unified auth

### System Architecture
```
Bridge UI → Bridge Server → MPC Nodes → Blockchain Networks
                              ↓
                    KMS + Lux ID + NATS + Consul
```

### MPC Network Configuration
- **Node Count**: 3 nodes (2-of-3 threshold)
- **Ports**:
  - HTTP API: 6000-6002
  - gRPC: 9090-9092
  - NATS: 4223
  - Consul: 8501
- **Security**: TLS 1.3, mutual authentication, HSM integration

## Supported Networks & Assets

### Blockchain Networks (15+)
**Layer 1**: Lux, Ethereum, BSC, Polygon, Avalanche, Fantom
**Layer 2**: Arbitrum, Optimism, zkSync Era, Polygon zkEVM, Base, Blast
**Other**: TON, Solana (coming soon), Cosmos (via IBC)

### Supported Assets
**Stablecoins**: USDT, USDC, DAI, ZUSD
**Native Tokens**: LUX, ETH, BNB, MATIC, AVAX
**Wrapped Assets**: ZETH, ZBNB, ZPOL, ZAVAX, ZTON (ERC20B standard)

## Key Smart Contracts

### Core Contracts
- `Bridge.sol` - Main bridge contract with deposit/withdraw logic
- `LuxVault.sol` - Asset vault for Lux Network
- `ETHVault.sol` - Ethereum vault contract
- `ZooVault.sol` - Multi-asset aggregated vault
- `LERC4626.sol` - Tokenized vault shares

### Wrapped Token Contracts (ERC20B)
All wrapped tokens follow the ERC20B standard with mint/burn capabilities:
- Location: `/contracts/contracts/zoo/`
- Examples: Z.sol, ZETH.sol, ZUSD.sol, ZBNB.sol

## API Endpoints

### REST API (Port 5000)
- `GET /api/v1/status` - Bridge operational status
- `GET /api/v1/chains` - Supported blockchains
- `GET /api/v1/assets` - Supported tokens
- `POST /api/v1/quote` - Get transfer quote
- `POST /api/v1/transfer` - Initiate transfer
- `GET /api/v1/transfer/{id}` - Transfer status

### WebSocket API
- Subscribe to transfer updates
- Real-time status notifications
- Event streaming for bridge operations

## Essential Commands

### Development
```bash
# Clone and install
git clone https://github.com/luxfi/bridge
cd bridge
pnpm install

# Install MPC tools
make install-mpc

# Start infrastructure
make up

# Start MPC nodes
make start-mpc-nodes

# Start services
cd app/bridge && pnpm dev  # UI on :3000
cd app/server && pnpm dev  # API on :5000
```

### Infrastructure Management
```bash
# Infrastructure
make up                     # Start all infra services
make down                   # Stop all services
make logs                   # View aggregated logs

# MPC Operations
make start-mpc-nodes        # Start 3-node MPC network
make stop-mpc-nodes         # Stop MPC nodes
make generate-mpc-keys      # Generate new MPC keys
lux-mpc-cli status          # Check MPC status

# Development
pnpm dev                    # Start development servers
pnpm build                  # Build for production
pnpm test                   # Run test suite
pnpm lint                   # Run linters

# Deployment
make deploy-testnet         # Deploy to testnet
make deploy-mainnet         # Deploy to mainnet
```

## Architecture

The bridge uses a multi-layered architecture:

1. **Presentation Layer**: React/Next.js UI for user interaction
2. **API Layer**: Node.js server handling business logic
3. **MPC Layer**: Distributed nodes for threshold signatures
4. **Blockchain Layer**: Smart contracts on multiple chains
5. **Infrastructure Layer**: Supporting services (DB, messaging, KMS)

### Data Flow
1. User initiates transfer on source chain
2. Bridge contract locks assets in vault
3. Event emitted and detected by MPC nodes
4. MPC nodes reach consensus and generate signature
5. Signed message relayed to destination chain
6. Destination contract mints wrapped tokens
7. User receives tokens on destination chain

## Key Technologies

- **Multi-Party Computation (MPC)**: Distributed key management
- **Threshold Signatures**: 2-of-3 security model
- **Smart Contracts**: Solidity with OpenZeppelin
- **Message Queue**: NATS for inter-node communication
- **Service Discovery**: Consul for dynamic configuration
- **Key Management**: HashiCorp Vault
- **Authentication**: Casdoor (Lux ID)
- **Database**: PostgreSQL for state management
- **Container Orchestration**: Docker/Kubernetes

## Development Workflow

### Local Development
1. Start infrastructure: `make up`
2. Initialize MPC network: `make start-mpc-nodes`
3. Deploy contracts: `cd contracts && npx hardhat deploy`
4. Start API server: `cd app/server && pnpm dev`
5. Start UI: `cd app/bridge && pnpm dev`

### Testing
- Unit tests: `pnpm test:unit`
- Integration tests: `pnpm test:integration`
- Contract tests: `cd contracts && npx hardhat test`
- E2E tests: `pnpm test:e2e`

### Deployment
1. Build artifacts: `pnpm build`
2. Deploy contracts: `make deploy-{network}`
3. Update configuration
4. Deploy services via CI/CD
5. Verify deployment: `make verify-deployment`

## Configuration

### Environment Variables
```env
# Network
NETWORK=mainnet|testnet|local
CHAIN_ID=31337

# Database
DATABASE_URL=postgresql://user:pass@localhost:5433/bridge

# MPC
MPC_NODE_COUNT=3
MPC_THRESHOLD=2

# KMS (Vault)
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=<token>

# Authentication (Lux ID)
CASDOOR_ENDPOINT=http://localhost:8000
```

### Service Ports
- Bridge UI: 3000
- Bridge API: 5000
- MPC Nodes: 6000-6002 (HTTP), 9090-9092 (gRPC)
- PostgreSQL: 5433 (bridge), 5434 (auth)
- Vault (KMS): 8200
- Lux ID: 8000
- NATS: 4223
- Consul: 8501

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Validate all inputs** - Prevent injection attacks
3. **Use secure communication** - TLS 1.3 everywhere
4. **Implement rate limiting** - Prevent DDoS
5. **Regular security audits** - Contract and code reviews
6. **Monitor everything** - Logs, metrics, alerts
7. **Incident response plan** - Be prepared for emergencies

## Monitoring & Debugging

### Health Checks
- Bridge API: `curl http://localhost:5000/health`
- MPC Nodes: `curl http://localhost:6000/health`
- Infrastructure: `http://localhost:8501/ui` (Consul)

### Debugging Commands
```bash
# Check MPC status
lux-mpc-cli status --url http://localhost:6000

# View logs
tail -f logs/mpc-node-*.log

# Database queries
psql $DATABASE_URL -c "SELECT * FROM transfers WHERE status='pending';"

# NATS monitoring
nats-top -s localhost:4223
```

## Documentation

### Comprehensive Documentation Site
- **Location**: `/Users/z/work/lux/bridge/docs/content/docs/index.mdx`
- **Build**: `cd docs && npm run build`
- **View**: `cd docs && npm run dev` → http://localhost:3001
- **Status**: ✅ Built successfully (November 2024)

### Key Documentation Files
- `docs/MPC-GO-INTEGRATION.md` - MPC setup and configuration
- `docs/LUX-ID-INTEGRATION.md` - Authentication integration
- `docs/DEPLOYMENT.md` - Production deployment guide
- `docs/MIGRATION-TO-GO-MPC.md` - Migration from Docker to Go

## Recent Updates

### November 2024
- Created comprehensive documentation in `/docs/content/docs/index.mdx`
- Built documentation site with Nextra theme
- Documented complete API reference
- Added security best practices section
- Created integration guide with code examples
- Added deployment guide for local and production
- Updated LLM.md with full bridge information

## Context for All AI Assistants

This file (`LLM.md`) is symlinked as:
- `AGENTS.md`
- `CLAUDE.md`
- `QWEN.md`
- `GEMINI.md`

All files reference the same knowledge base. Updates here propagate to all AI systems.

## Rules for AI Assistants

1. **ALWAYS** update LLM.md with significant discoveries
2. **NEVER** commit symlinked files (AGENTS.md, CLAUDE.md, etc.) - they're in .gitignore
3. **NEVER** create random summary files - update THIS file

---

**Note**: This file serves as the single source of truth for all AI assistants working on this project.
