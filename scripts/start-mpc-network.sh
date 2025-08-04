#!/bin/bash

echo "==================================="
echo "Starting Lux MPC Network"
echo "==================================="
echo ""

# Check if MPC tools are installed
if ! command -v lux-mpc &> /dev/null; then
    echo "❌ lux-mpc not found. Please run ./scripts/install-mpc-tools.sh first."
    exit 1
fi

# Configuration
MPC_DATA_DIR="${MPC_DATA_DIR:-./data/mpc}"
MPC_CONFIG_DIR="${MPC_CONFIG_DIR:-./config/mpc}"
NATS_URL="${NATS_URL:-nats://localhost:4223}"
CONSUL_URL="${CONSUL_URL:-http://localhost:8501}"
KMS_URL="${KMS_URL:-http://localhost:8200}"
KMS_TOKEN="${KMS_TOKEN:-myroot}"
LUXID_URL="${LUXID_URL:-http://localhost:8000}"

# Create directories
echo "Creating directories..."
mkdir -p "$MPC_DATA_DIR"/{node0,node1,node2}
mkdir -p "$MPC_CONFIG_DIR"
mkdir -p logs

# Generate MPC configuration if not exists
if [ ! -f "$MPC_CONFIG_DIR/config.yaml" ]; then
    echo "Generating MPC configuration..."
    cat > "$MPC_CONFIG_DIR/config.yaml" << EOF
# Lux MPC Network Configuration
network:
  name: bridge-mpc
  threshold: 2
  total_nodes: 3

nodes:
  - id: mpc-node-0
    port: 6000
    grpc_port: 9090
  - id: mpc-node-1
    port: 6001
    grpc_port: 9091
  - id: mpc-node-2
    port: 6002
    grpc_port: 9092

nats:
  url: ${NATS_URL}
  subject_prefix: bridge.mpc

consul:
  url: ${CONSUL_URL}
  service_name: bridge-mpc

kms:
  url: ${KMS_URL}
  token: ${KMS_TOKEN}
  project_id: mpc-bridge
  secret_path: /mpc

auth:
  provider: luxid
  luxid_url: ${LUXID_URL}
  client_id: mpc-bridge
  client_secret: mpc-bridge-secret
EOF
fi

# Generate peer configuration if not exists
if [ ! -f "$MPC_CONFIG_DIR/peers.json" ]; then
    echo "Generating peer configuration..."
    lux-mpc-cli generate-peers --number 3 --output "$MPC_CONFIG_DIR/peers.json"
fi

# Function to start a node
start_node() {
    local node_id=$1
    local port=$2
    local grpc_port=$3
    
    echo "Starting $node_id on port $port (gRPC: $grpc_port)..."
    
    # Set environment variables
    export NODE_ID="$node_id"
    export NODE_PORT="$port"
    export GRPC_PORT="$grpc_port"
    export NATS_URL="$NATS_URL"
    export CONSUL_URL="$CONSUL_URL"
    export DATA_DIR="$MPC_DATA_DIR/$node_id"
    export CONFIG_PATH="$MPC_CONFIG_DIR/config.yaml"
    export PEERS_PATH="$MPC_CONFIG_DIR/peers.json"
    export LOG_LEVEL="${LOG_LEVEL:-info}"
    
    # KMS configuration
    export KMS_URL="$KMS_URL"
    export KMS_TOKEN="$KMS_TOKEN"
    export KMS_PROJECT_ID="mpc-bridge"
    export KMS_SECRET_PATH="/mpc"
    
    # Lux ID configuration
    export LUXID_URL="$LUXID_URL"
    export LUXID_CLIENT_ID="mpc-$node_id"
    export LUXID_CLIENT_SECRET="mpc-secret"
    
    # Create node-specific config
    cat > "$DATA_DIR/config.yaml" << EOF
nats:
  url: ${NATS_URL}
consul:
  address: localhost:8500
  
mpc_threshold: 2
environment: local
badger_password: "12345678901234567890123456789012"
event_initiator_pubkey: "c3f3511cd2f849fd61e81ea62a842fd33367ee8fb5b867bb900877c7fb72ce3b"
max_concurrent_keygen: 2
db_path: "${DATA_DIR}"
backup_enabled: true
backup_period_seconds: 300
backup_dir: ${DATA_DIR}/backups

# Node specific settings
node_name: "${node_id}"
http_port: ${port}
grpc_port: ${grpc_port}
EOF
    
    # Create identity directory and copy all identity files
    mkdir -p "$DATA_DIR/identity"
    # Copy all identity files from all nodes
    for i in 0 1 2; do
        cp "$MPC_DATA_DIR/node$i/node${i}_identity.json" "$DATA_DIR/identity/" 2>/dev/null || true
    done
    # Copy only this node's private key
    cp "$MPC_DATA_DIR/$node_id/${node_id}_private.key" "$DATA_DIR/identity/" 2>/dev/null || true
    
    # Copy peers.json to node directory
    cp "$MPC_CONFIG_DIR/peers.json" "$DATA_DIR/peers.json"
    
    # Start the node  
    LOG_FILE="$(pwd)/logs/$node_id.log"
    cd "$DATA_DIR" && lux-mpc start --name "$node_id" > "$LOG_FILE" 2>&1 &
    
    echo "$node_id started with PID $!"
}

# Check if infrastructure is running
echo "Checking infrastructure services..."
if ! nc -z localhost 4223 2>/dev/null; then
    echo "⚠️  NATS not running on port 4223. Make sure to run 'make up' first."
fi

if ! nc -z localhost 8501 2>/dev/null; then
    echo "⚠️  Consul not running on port 8501. Make sure to run 'make up' first."
fi

if ! nc -z localhost 8200 2>/dev/null; then
    echo "⚠️  KMS not running on port 8200. Make sure to run 'make up' first."
fi

if ! nc -z localhost 8000 2>/dev/null; then
    echo "⚠️  Lux ID not running on port 8000. Make sure to run 'make up' first."
fi

echo ""

# Start all nodes
start_node "node0" 6000 9090
sleep 2
start_node "node1" 6001 9091
sleep 2
start_node "node2" 6002 9092

echo ""
echo "==================================="
echo "MPC Network Started!"
echo "==================================="
echo ""
echo "Nodes:"
echo "  - node0: HTTP=6000, gRPC=9090"
echo "  - node1: HTTP=6001, gRPC=9091"
echo "  - node2: HTTP=6002, gRPC=9092"
echo ""
echo "Logs:"
echo "  - logs/node0.log"
echo "  - logs/node1.log"
echo "  - logs/node2.log"
echo ""
echo "To check status:"
echo "  lux-mpc-cli status --url http://localhost:6000"
echo ""
echo "To stop the network:"
echo "  ./scripts/stop-mpc-network.sh"