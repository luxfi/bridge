#!/bin/bash
# Launch Lux Bridge with integrated MPC

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Lux Bridge with Modern MPC Launch Script ===${NC}"
echo

# Parse command line arguments
ACTION=${1:-"start"}
ENVIRONMENT=${2:-"local"}

# Functions
show_help() {
    echo "Usage: $0 [action] [environment]"
    echo
    echo "Actions:"
    echo "  start     - Start all services"
    echo "  stop      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  status    - Show service status"
    echo "  logs      - Show logs"
    echo "  init      - Initialize MPC keys"
    echo "  test      - Run E2E tests"
    echo
    echo "Environments:"
    echo "  local     - Local development (docker-compose)"
    echo "  k8s       - Kubernetes deployment"
    echo "  prod      - Production deployment"
}

check_dependencies() {
    echo "Checking dependencies..."
    
    local missing=0
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗${NC} Docker not found"
        missing=1
    else
        echo -e "${GREEN}✓${NC} Docker"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}✗${NC} Docker Compose not found"
        missing=1
    else
        echo -e "${GREEN}✓${NC} Docker Compose"
    fi
    
    # Check kubectl for k8s
    if [ "$ENVIRONMENT" = "k8s" ] || [ "$ENVIRONMENT" = "prod" ]; then
        if ! command -v kubectl &> /dev/null; then
            echo -e "${RED}✗${NC} kubectl not found"
            missing=1
        else
            echo -e "${GREEN}✓${NC} kubectl"
        fi
    fi
    
    if [ $missing -eq 1 ]; then
        echo
        echo -e "${RED}Missing dependencies. Please install required tools.${NC}"
        exit 1
    fi
    
    echo
}

start_local() {
    echo -e "${BLUE}Starting local environment...${NC}"
    
    # Build images if needed
    if [ ! -z "$BUILD" ]; then
        echo "Building images..."
        docker-compose -f docker-compose.mpc.yaml build
    fi
    
    # Start infrastructure first
    echo "Starting infrastructure services..."
    docker-compose -f docker-compose.mpc.yaml up -d nats consul postgres
    
    # Wait for infrastructure
    echo "Waiting for infrastructure to be ready..."
    sleep 10
    
    # Start MPC nodes
    echo "Starting MPC nodes..."
    docker-compose -f docker-compose.mpc.yaml up -d mpc-node-0 mpc-node-1 mpc-node-2
    
    # Wait for MPC nodes
    echo "Waiting for MPC nodes to be ready..."
    sleep 15
    
    # Initialize MPC if needed
    if [ ! -f ".mpc-initialized" ]; then
        echo "Initializing MPC keys..."
        docker-compose -f docker-compose.mpc.yaml run --rm bridge-server /app/scripts/init-mpc.sh
        touch .mpc-initialized
    fi
    
    # Start bridge services
    echo "Starting bridge services..."
    docker-compose -f docker-compose.mpc.yaml up -d bridge-server bridge-ui
    
    # Start monitoring
    echo "Starting monitoring..."
    docker-compose -f docker-compose.mpc.yaml up -d prometheus grafana
    
    echo
    echo -e "${GREEN}✓ All services started${NC}"
    echo
    echo "Access points:"
    echo "  Bridge UI:      http://localhost:3001"
    echo "  Bridge API:     http://localhost:3000"
    echo "  Consul UI:      http://localhost:8500"
    echo "  Grafana:        http://localhost:3002 (admin/admin)"
    echo "  NATS Monitor:   http://localhost:8222"
}

start_k8s() {
    echo -e "${BLUE}Starting Kubernetes deployment...${NC}"
    
    # Apply namespace
    kubectl apply -f k8s/namespace.yaml
    
    # Apply configurations
    echo "Applying Kubernetes configurations..."
    kubectl apply -f k8s/mpc-deployment.yaml
    
    # Wait for pods
    echo "Waiting for pods to be ready..."
    kubectl wait --for=condition=ready pod -l app=mpc-node -n lux-bridge --timeout=300s
    kubectl wait --for=condition=ready pod -l app=bridge-server -n lux-bridge --timeout=300s
    
    # Initialize MPC if needed
    if ! kubectl get secret mpc-initialized -n lux-bridge &> /dev/null; then
        echo "Initializing MPC keys..."
        kubectl exec -it deployment/bridge-server -n lux-bridge -- /app/scripts/init-mpc.sh
        kubectl create secret generic mpc-initialized -n lux-bridge --from-literal=initialized=true
    fi
    
    echo
    echo -e "${GREEN}✓ Kubernetes deployment complete${NC}"
    echo
    echo "Get service endpoints:"
    echo "  kubectl get svc -n lux-bridge"
}

stop_local() {
    echo -e "${BLUE}Stopping local environment...${NC}"
    docker-compose -f docker-compose.mpc.yaml down
    echo -e "${GREEN}✓ Services stopped${NC}"
}

stop_k8s() {
    echo -e "${BLUE}Stopping Kubernetes deployment...${NC}"
    kubectl delete -f k8s/mpc-deployment.yaml
    echo -e "${GREEN}✓ Kubernetes resources deleted${NC}"
}

show_status() {
    if [ "$ENVIRONMENT" = "local" ]; then
        echo -e "${BLUE}Service Status:${NC}"
        docker-compose -f docker-compose.mpc.yaml ps
        
        echo
        echo -e "${BLUE}MPC Network Status:${NC}"
        curl -s http://localhost:3000/api/v1/mpc/status | jq . || echo "Bridge server not responding"
    else
        echo -e "${BLUE}Pod Status:${NC}"
        kubectl get pods -n lux-bridge
        
        echo
        echo -e "${BLUE}Service Status:${NC}"
        kubectl get svc -n lux-bridge
    fi
}

show_logs() {
    if [ "$ENVIRONMENT" = "local" ]; then
        SERVICE=${2:-""}
        if [ -z "$SERVICE" ]; then
            docker-compose -f docker-compose.mpc.yaml logs -f --tail=100
        else
            docker-compose -f docker-compose.mpc.yaml logs -f --tail=100 $SERVICE
        fi
    else
        kubectl logs -f -n lux-bridge -l app=bridge-server --tail=100
    fi
}

run_tests() {
    echo -e "${BLUE}Running E2E tests...${NC}"
    
    # Ensure services are running
    if [ "$ENVIRONMENT" = "local" ]; then
        if ! docker-compose -f docker-compose.mpc.yaml ps | grep -q "Up"; then
            echo -e "${YELLOW}Services not running. Starting...${NC}"
            start_local
            sleep 20
        fi
    fi
    
    # Run tests
    cd test/e2e
    npm test mpc-integration.test.ts
}

init_mpc() {
    echo -e "${BLUE}Initializing MPC keys...${NC}"
    
    if [ "$ENVIRONMENT" = "local" ]; then
        docker-compose -f docker-compose.mpc.yaml run --rm bridge-server /app/scripts/init-mpc.sh
    else
        kubectl exec -it deployment/bridge-server -n lux-bridge -- /app/scripts/init-mpc.sh
    fi
}

# Main logic
check_dependencies

case "$ACTION" in
    start)
        if [ "$ENVIRONMENT" = "local" ]; then
            start_local
        elif [ "$ENVIRONMENT" = "k8s" ] || [ "$ENVIRONMENT" = "prod" ]; then
            start_k8s
        else
            echo -e "${RED}Unknown environment: $ENVIRONMENT${NC}"
            exit 1
        fi
        ;;
    stop)
        if [ "$ENVIRONMENT" = "local" ]; then
            stop_local
        elif [ "$ENVIRONMENT" = "k8s" ] || [ "$ENVIRONMENT" = "prod" ]; then
            stop_k8s
        else
            echo -e "${RED}Unknown environment: $ENVIRONMENT${NC}"
            exit 1
        fi
        ;;
    restart)
        $0 stop $ENVIRONMENT
        sleep 5
        $0 start $ENVIRONMENT
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    init)
        init_mpc
        ;;
    test)
        run_tests
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown action: $ACTION${NC}"
        echo
        show_help
        exit 1
        ;;
esac