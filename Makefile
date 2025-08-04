# Bridge Ecosystem Makefile
.PHONY: help build push up down restart logs clean test dev mainnet testnet

# Default target
help:
	@echo "Bridge Ecosystem Management"
	@echo ""
	@echo "Usage:"
	@echo "  make build       - Build all Docker images locally"
	@echo "  make push        - Push images to ghcr.io/luxfi"
	@echo "  make up          - Start development server (requires ghcr.io images)"
	@echo "  make up-local    - Start local infrastructure only (recommended)"
	@echo "  make dev         - Alias for 'make up'"
	@echo "  make mainnet     - Start mainnet deployment"
	@echo "  make testnet     - Start testnet deployment"
	@echo "  make down        - Stop the bridge ecosystem"
	@echo "  make down-local  - Stop local infrastructure and MPC nodes"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - View logs for all services"
	@echo "  make clean       - Clean up volumes and containers"
	@echo "  make test        - Run tests"
	@echo "  make export-keys - Export MPC keys from running nodes"
	@echo ""
	@echo "For local development without Docker images:"
	@echo "  1. make up-local    # Start infrastructure"
	@echo "  2. ./start-mpc-local.sh  # Start MPC nodes"
	@echo "  3. cd app/server && pnpm dev  # Start server"
	@echo "  4. cd app/bridge && pnpm dev  # Start UI"

# Build all Docker images
build: build-mpc build-server build-ui

build-mpc:
	@echo "Building MPC service..."
	cd ../mpc && docker buildx build --platform linux/amd64,linux/arm64 \
		-t ghcr.io/luxfi/lux-mpc:latest \
		-f Dockerfile \
		.

build-server:
	@echo "Building Bridge server..."
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t ghcr.io/luxfi/bridge-server:latest \
		-f app/server/Dockerfile \
		app/server/

build-ui:
	@echo "Building Bridge UI..."
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t ghcr.io/luxfi/bridge-ui:latest \
		-f app/bridge/Dockerfile \
		app/bridge/

# Push images to ghcr.io/luxfi
push: build
	@echo "Pushing images to ghcr.io/luxfi..."
	docker push ghcr.io/luxfi/lux-mpc:latest
	docker push ghcr.io/luxfi/bridge-server:latest
	docker push ghcr.io/luxfi/bridge-ui:latest

# Start local development server
up:
	@echo "Starting local development infrastructure (KMS, Lux ID, databases)..."
	@echo "Note: MPC nodes and app services should be run locally"
	docker compose -f compose.local.yml up -d
	@echo ""
	@echo "Infrastructure started! Now run:"
	@echo "  1. MPC nodes: cd ../mpc && make build && ./lux-mpc start"
	@echo "  2. Bridge server: cd app/server && pnpm dev"
	@echo "  3. Bridge UI: cd app/bridge && pnpm dev"

# Start local development with infrastructure only
up-local:
	@echo "Starting local infrastructure services..."
	docker compose -f compose-infra.yml up -d
	@echo ""
	@echo "Infrastructure started! Now run:"
	@echo "  1. MPC nodes: make start-mpc-nodes"
	@echo "  2. Bridge server: cd app/server && pnpm dev"
	@echo "  3. Bridge UI: cd app/bridge && pnpm dev"

# Alias for up
dev: up

# Start mainnet deployment
mainnet:
	@echo "Starting mainnet deployment..."
	docker compose -f compose.mainnet.yml up -d

# Start testnet deployment
testnet:
	@echo "Starting testnet deployment..."
	docker compose -f compose.testnet.yml up -d

# Stop the bridge ecosystem
down:
	@echo "Stopping bridge ecosystem..."
	docker compose -f compose.local.yml down

# Stop local infrastructure
down-local:
	@echo "Stopping local infrastructure..."
	docker compose -f compose-infra.yml down
	@echo "Stopping MPC nodes..."
	make stop-mpc-nodes || true

# Restart all services
restart: down up

# View logs
logs:
	docker compose logs -f

# Clean up
clean:
	@echo "Cleaning up..."
	docker compose down -v
	docker system prune -f

# Run tests
test:
	@echo "Running tests..."
	cd app/server && pnpm test
	cd mpc-service && go test ./...

# Install dependencies
install:
	@echo "Installing dependencies..."
	cd app/server && pnpm install
	cd app/bridge && pnpm install

# Login to GitHub Container Registry
login:
	@echo "Logging in to ghcr.io..."
	docker login ghcr.io

# Export MPC keys from running nodes
export-keys:
	@echo "Exporting MPC keys from running nodes..."
	@echo "Creating exports directory..."
	@mkdir -p exports/mpc-keys
	@echo "Exporting from mpc-node-0..."
	docker exec bridge-mpc-0 cat /data/mpc/keys/node_key.json > exports/mpc-keys/node-0-key.json || echo "Failed to export from node-0"
	@echo "Exporting from mpc-node-1..."
	docker exec bridge-mpc-1 cat /data/mpc/keys/node_key.json > exports/mpc-keys/node-1-key.json || echo "Failed to export from node-1"
	@echo "Exporting from mpc-node-2..."
	docker exec bridge-mpc-2 cat /data/mpc/keys/node_key.json > exports/mpc-keys/node-2-key.json || echo "Failed to export from node-2"
	@echo "Keys exported to exports/mpc-keys/"
	@echo "WARNING: These keys are sensitive. Store them securely!"

# Import MPC keys to new deployment
import-keys:
	@echo "Importing MPC keys to nodes..."
	@if [ ! -d "exports/mpc-keys" ]; then echo "No keys found in exports/mpc-keys/"; exit 1; fi
	docker cp exports/mpc-keys/node-0-key.json bridge-mpc-0:/data/mpc/keys/node_key.json
	docker cp exports/mpc-keys/node-1-key.json bridge-mpc-1:/data/mpc/keys/node_key.json
	docker cp exports/mpc-keys/node-2-key.json bridge-mpc-2:/data/mpc/keys/node_key.json
	@echo "Keys imported. Restart nodes to apply."

# Install MPC tools
install-mpc:
	@echo "Installing MPC tools..."
	@./scripts/install-mpc-tools.sh

# Start MPC nodes locally
start-mpc-nodes:
	@echo "Starting MPC nodes locally..."
	@./scripts/start-mpc-network.sh

# Stop MPC nodes
stop-mpc-nodes:
	@echo "Stopping MPC nodes..."
	@./scripts/stop-mpc-network.sh

# Initialize MPC keys
init-mpc:
	@echo "Initializing MPC keys..."
	cd ../mpc && ./lux-mpc-cli generate-peers --number 3 --output peers.json
	cd ../mpc && ./scripts/setup_identities.sh
	@echo "MPC keys initialized"

# Backup all data
backup:
	@echo "Creating backup..."
	@mkdir -p backups/$(shell date +%Y%m%d_%H%M%S)
	docker exec bridge-postgres pg_dump -U bridge bridge > backups/$(shell date +%Y%m%d_%H%M%S)/postgres.sql
	docker cp bridge-mpc-0:/data/mpc backups/$(shell date +%Y%m%d_%H%M%S)/mpc-0
	docker cp bridge-mpc-1:/data/mpc backups/$(shell date +%Y%m%d_%H%M%S)/mpc-1
	docker cp bridge-mpc-2:/data/mpc backups/$(shell date +%Y%m%d_%H%M%S)/mpc-2
	@echo "Backup created in backups/"