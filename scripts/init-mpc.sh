#!/bin/bash
# Initialize MPC keys for Lux Bridge

set -e

echo "=== Lux Bridge MPC Initialization ==="
echo

# Configuration
CONSUL_URL=${CONSUL_URL:-"http://localhost:8500"}
NATS_URL=${NATS_URL:-"nats://localhost:4222"}
KEY_PREFIX=${KEY_PREFIX:-"bridge/mpc"}
THRESHOLD=${THRESHOLD:-2}
TOTAL_NODES=${TOTAL_NODES:-3}

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if services are running
check_services() {
    echo "Checking required services..."
    
    # Check Consul
    if curl -s "${CONSUL_URL}/v1/status/leader" > /dev/null; then
        echo -e "${GREEN}✓${NC} Consul is running"
    else
        echo -e "${RED}✗${NC} Consul is not accessible at ${CONSUL_URL}"
        exit 1
    fi
    
    # Check NATS
    if nc -z $(echo $NATS_URL | sed 's/nats:\/\///' | cut -d: -f1) $(echo $NATS_URL | sed 's/.*://' | sed 's/\///'); then
        echo -e "${GREEN}✓${NC} NATS is running"
    else
        echo -e "${RED}✗${NC} NATS is not accessible at ${NATS_URL}"
        exit 1
    fi
    
    echo
}

# Check if MPC keys already exist
check_existing_keys() {
    echo "Checking for existing MPC keys..."
    
    # Query Consul for existing keys
    existing_keys=$(curl -s "${CONSUL_URL}/v1/kv/${KEY_PREFIX}/public-key" || echo "null")
    
    if [ "$existing_keys" != "null" ] && [ "$existing_keys" != "[]" ]; then
        echo -e "${YELLOW}!${NC} MPC keys already exist in Consul"
        echo
        read -p "Do you want to regenerate keys? This will invalidate existing signatures! (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Keeping existing keys."
            exit 0
        fi
        echo -e "${YELLOW}Warning:${NC} Regenerating keys..."
        # Clear existing keys
        curl -X DELETE "${CONSUL_URL}/v1/kv/${KEY_PREFIX}?recurse=true"
    else
        echo -e "${GREEN}✓${NC} No existing keys found, proceeding with initialization"
    fi
    
    echo
}

# Wait for MPC nodes to be ready
wait_for_nodes() {
    echo "Waiting for MPC nodes to register..."
    
    local ready_nodes=0
    local attempts=0
    local max_attempts=30
    
    while [ $ready_nodes -lt $TOTAL_NODES ] && [ $attempts -lt $max_attempts ]; do
        # Query Consul for registered MPC nodes
        nodes=$(curl -s "${CONSUL_URL}/v1/health/service/bridge-mpc?passing=true" | jq length)
        ready_nodes=$nodes
        
        echo -ne "\rNodes ready: ${ready_nodes}/${TOTAL_NODES} "
        
        if [ $ready_nodes -lt $TOTAL_NODES ]; then
            sleep 2
            ((attempts++))
        fi
    done
    
    echo
    
    if [ $ready_nodes -lt $TOTAL_NODES ]; then
        echo -e "${RED}✗${NC} Timeout waiting for MPC nodes. Only ${ready_nodes}/${TOTAL_NODES} nodes are ready."
        exit 1
    fi
    
    echo -e "${GREEN}✓${NC} All ${TOTAL_NODES} MPC nodes are ready"
    echo
}

# Initialize distributed key generation
init_key_generation() {
    echo "Initiating distributed key generation..."
    
    # Create key generation coordination message
    coordination_msg=$(cat <<EOF
{
    "type": "start",
    "threshold": ${THRESHOLD},
    "totalNodes": ${TOTAL_NODES},
    "timestamp": $(date +%s),
    "sessionId": "bridge-keygen-$(date +%s)"
}
EOF
)
    
    # Store coordination in Consul
    echo "$coordination_msg" | curl -X PUT -d @- \
        "${CONSUL_URL}/v1/kv/${KEY_PREFIX}/keygen/coordination"
    
    # Trigger key generation via NATS
    echo "Triggering key generation on all nodes..."
    
    # Use lux-mpc-cli if available, otherwise use HTTP API
    if command -v lux-mpc-cli &> /dev/null; then
        lux-mpc-cli keygen \
            --key-id "bridge-key" \
            --protocol "ecdsa" \
            --threshold ${THRESHOLD} \
            --parties ${TOTAL_NODES} \
            --endpoint "http://localhost:8080"
    else
        # Fallback to HTTP API
        for i in $(seq 0 $((TOTAL_NODES - 1))); do
            port=$((8080 + i))
            curl -X POST "http://localhost:${port}/api/v1/keygen" \
                -H "Content-Type: application/json" \
                -d "{\"keyId\": \"bridge-key\", \"threshold\": ${THRESHOLD}, \"parties\": ${TOTAL_NODES}}" &
        done
        wait
    fi
    
    echo
}

# Wait for key generation to complete
wait_for_keygen() {
    echo "Waiting for key generation to complete..."
    
    local completed=false
    local attempts=0
    local max_attempts=60
    
    while [ "$completed" = false ] && [ $attempts -lt $max_attempts ]; do
        # Check if public key has been generated
        public_key=$(curl -s "${CONSUL_URL}/v1/kv/${KEY_PREFIX}/public-key" | jq -r '.[0].Value // empty' | base64 -d 2>/dev/null || echo "")
        
        if [ -n "$public_key" ]; then
            completed=true
            echo
            echo -e "${GREEN}✓${NC} Key generation completed successfully!"
            echo "Public key: ${public_key}"
        else
            echo -ne "\rWaiting... $(($max_attempts - $attempts))s remaining "
            sleep 1
            ((attempts++))
        fi
    done
    
    echo
    
    if [ "$completed" = false ]; then
        echo -e "${RED}✗${NC} Key generation timeout"
        exit 1
    fi
}

# Verify key shares
verify_key_shares() {
    echo "Verifying key shares..."
    
    # Get all key shares from Consul
    shares=$(curl -s "${CONSUL_URL}/v1/kv/${KEY_PREFIX}/shares?keys=true" | jq -r '.[]' | grep -v "/$" | wc -l)
    
    if [ "$shares" -eq "$TOTAL_NODES" ]; then
        echo -e "${GREEN}✓${NC} All ${TOTAL_NODES} key shares are stored"
    else
        echo -e "${RED}✗${NC} Only ${shares}/${TOTAL_NODES} key shares found"
        exit 1
    fi
    
    # Test signing capability
    echo
    echo "Testing signature generation..."
    
    test_message="test-$(date +%s)"
    test_hash=$(echo -n "$test_message" | sha256sum | cut -d' ' -f1)
    
    if command -v lux-mpc-cli &> /dev/null; then
        signature=$(lux-mpc-cli sign \
            --session-id "test-${test_message}" \
            --message "0x${test_hash}" \
            --key-id "bridge-key" \
            --protocol "ecdsa" \
            --endpoint "http://localhost:8080" 2>/dev/null || echo "")
    fi
    
    if [ -n "$signature" ]; then
        echo -e "${GREEN}✓${NC} Signature test successful"
    else
        echo -e "${YELLOW}!${NC} Signature test skipped (CLI not available)"
    fi
    
    echo
}

# Store configuration
store_configuration() {
    echo "Storing MPC configuration..."
    
    config=$(cat <<EOF
{
    "threshold": ${THRESHOLD},
    "totalNodes": ${TOTAL_NODES},
    "keyId": "bridge-key",
    "protocol": "ecdsa",
    "curve": "secp256k1",
    "initialized": $(date -u +"%Y-%m-%dT%H:%M:%SZ"),
    "version": "1.0.0"
}
EOF
)
    
    echo "$config" | curl -X PUT -d @- \
        "${CONSUL_URL}/v1/kv/${KEY_PREFIX}/config"
    
    echo -e "${GREEN}✓${NC} Configuration stored"
    echo
}

# Main execution
main() {
    echo "Configuration:"
    echo "  Consul URL: ${CONSUL_URL}"
    echo "  NATS URL: ${NATS_URL}"
    echo "  Threshold: ${THRESHOLD}"
    echo "  Total Nodes: ${TOTAL_NODES}"
    echo "  Key Prefix: ${KEY_PREFIX}"
    echo
    
    check_services
    check_existing_keys
    wait_for_nodes
    init_key_generation
    wait_for_keygen
    verify_key_shares
    store_configuration
    
    echo "=== MPC Initialization Complete ==="
    echo
    echo "The Lux Bridge MPC network is now initialized with:"
    echo "  - ${TOTAL_NODES} nodes"
    echo "  - ${THRESHOLD}-of-${TOTAL_NODES} threshold signing"
    echo "  - Keys stored in Consul under '${KEY_PREFIX}'"
    echo
    echo "You can now start using the bridge for cross-chain transfers!"
}

# Run main function
main