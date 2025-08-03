#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Lux Bridge Local Environment...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Clean up any existing containers
echo -e "${YELLOW}Cleaning up existing containers...${NC}"
docker-compose -f docker-compose.local.yaml down -v

# Build MPC service
echo -e "${YELLOW}Building MPC service...${NC}"
cd mpc-service && go mod tidy && cd ..

# Start infrastructure services first
echo -e "${YELLOW}Starting infrastructure services...${NC}"
docker-compose -f docker-compose.local.yaml up -d nats consul postgres

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for infrastructure services to be ready...${NC}"
sleep 10

# Start MPC nodes
echo -e "${YELLOW}Starting MPC nodes...${NC}"
docker-compose -f docker-compose.local.yaml up -d mpc-node-0 mpc-node-1 mpc-node-2

# Wait for MPC nodes to be ready
echo -e "${YELLOW}Waiting for MPC nodes to initialize...${NC}"
sleep 5

# Start bridge server and UI
echo -e "${YELLOW}Starting bridge server and UI...${NC}"
docker-compose -f docker-compose.local.yaml up -d bridge-server bridge-ui

# Show status
echo -e "${GREEN}Bridge environment is starting up!${NC}"
echo -e "${YELLOW}Services:${NC}"
echo "  - NATS: http://localhost:8223"
echo "  - Consul: http://localhost:8501"
echo "  - Bridge UI: http://localhost:3000"
echo "  - Bridge API: http://localhost:5000"
echo "  - MPC Nodes: http://localhost:6000, :6001, :6002"
echo "  - PostgreSQL: localhost:5433"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo "  docker-compose -f docker-compose.local.yaml logs -f"
echo ""
echo -e "${YELLOW}Stop:${NC}"
echo "  docker-compose -f docker-compose.local.yaml down"