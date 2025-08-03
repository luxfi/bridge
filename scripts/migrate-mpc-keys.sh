#!/bin/bash

# MPC Key Migration Script
# Migrates from GG18 to CGG21MP protocol

set -e

echo "=== MPC Key Migration Tool ==="
echo "This script helps migrate from GG18 to CGG21MP MPC protocol"
echo ""

# Check if running in Kubernetes
if kubectl get pods &> /dev/null; then
    echo "Detected Kubernetes environment"
    USE_K8S=true
else
    echo "Using Docker Compose environment"
    USE_K8S=false
fi

# Function to export keys from Kubernetes
export_k8s_keys() {
    echo "Exporting keys from Kubernetes MPC pods..."
    
    # Find MPC pods
    MPC_PODS=$(kubectl get pods -l app=mpc-node -o jsonpath='{.items[*].metadata.name}')
    
    if [ -z "$MPC_PODS" ]; then
        echo "Error: No MPC pods found in Kubernetes"
        exit 1
    fi
    
    mkdir -p exports/k8s-mpc-keys
    
    for pod in $MPC_PODS; do
        echo "Exporting from pod: $pod"
        kubectl exec $pod -- cat /data/mpc/keys/node_key.json > exports/k8s-mpc-keys/${pod}-key.json || echo "Failed to export from $pod"
        kubectl exec $pod -- cat /data/mpc/wallet/public_key.json > exports/k8s-mpc-keys/${pod}-pubkey.json || echo "Failed to export public key from $pod"
    done
    
    echo "Kubernetes keys exported to exports/k8s-mpc-keys/"
}

# Function to export keys from Docker
export_docker_keys() {
    echo "Exporting keys from Docker containers..."
    make export-keys
}

# Function to analyze key format
analyze_keys() {
    echo ""
    echo "Analyzing exported keys..."
    
    KEY_DIR="exports/mpc-keys"
    if [ "$USE_K8S" = true ]; then
        KEY_DIR="exports/k8s-mpc-keys"
    fi
    
    if [ ! -d "$KEY_DIR" ]; then
        echo "Error: No exported keys found in $KEY_DIR"
        exit 1
    fi
    
    for key_file in $KEY_DIR/*-key.json; do
        if [ -f "$key_file" ]; then
            echo ""
            echo "Analyzing: $key_file"
            
            # Check if it's GG18 format
            if grep -q "gg18" "$key_file" || grep -q "GG18" "$key_file"; then
                echo "  Format: GG18 (legacy)"
                echo "  Status: Needs migration to CGG21MP"
            elif grep -q "cgg21mp" "$key_file" || grep -q "CGG21MP" "$key_file"; then
                echo "  Format: CGG21MP (current)"
                echo "  Status: No migration needed"
            else
                echo "  Format: Unknown"
                echo "  Status: Manual inspection required"
            fi
            
            # Extract key info
            if command -v jq &> /dev/null; then
                NODE_ID=$(jq -r '.node_id // .party_id // "unknown"' "$key_file" 2>/dev/null)
                echo "  Node ID: $NODE_ID"
            fi
        fi
    done
}

# Function to generate migration config
generate_migration_config() {
    echo ""
    echo "Generating migration configuration..."
    
    cat > migration-config.json << EOF
{
    "migration_type": "gg18_to_cgg21mp",
    "source_protocol": "GG18",
    "target_protocol": "CGG21MP",
    "threshold": 2,
    "total_parties": 3,
    "migration_options": {
        "preserve_address": true,
        "generate_new_shares": false,
        "backup_old_keys": true
    }
}
EOF
    
    echo "Migration config written to migration-config.json"
}

# Function to create new CGG21MP wallet
create_new_wallet() {
    echo ""
    echo "=== Creating New CGG21MP Wallet ==="
    echo ""
    echo "This will create a fresh CGG21MP MPC wallet."
    echo "The old GG18 funds will need to be swept to this new wallet."
    echo ""
    read -p "Continue? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
    
    # Start fresh MPC nodes with CGG21MP
    echo "Starting new MPC nodes with CGG21MP protocol..."
    
    # Create docker-compose override for CGG21MP
    cat > docker-compose.cgg21mp.yml << EOF
services:
  mpc-node-0:
    environment:
      - MPC_PROTOCOL=CGG21MP
      - GENERATE_NEW_KEY=true
      
  mpc-node-1:
    environment:
      - MPC_PROTOCOL=CGG21MP
      - GENERATE_NEW_KEY=true
      
  mpc-node-2:
    environment:
      - MPC_PROTOCOL=CGG21MP
      - GENERATE_NEW_KEY=true
EOF
    
    echo "Starting CGG21MP nodes..."
    docker compose -f docker-compose.yaml -f docker-compose.cgg21mp.yml up -d mpc-node-0 mpc-node-1 mpc-node-2
    
    echo ""
    echo "Waiting for key generation..."
    sleep 10
    
    # Get new wallet address
    echo "Retrieving new wallet address..."
    docker exec bridge-mpc-0 cat /data/mpc/wallet/address.txt 2>/dev/null || echo "Address not yet available"
}

# Function to display sweep instructions
display_sweep_instructions() {
    echo ""
    echo "=== Sweep Instructions ==="
    echo ""
    echo "To complete the migration from GG18 to CGG21MP:"
    echo ""
    echo "1. Export the old GG18 wallet address and private key shares"
    echo "2. Create a new CGG21MP MPC wallet (already done if you ran this script)"
    echo "3. Coordinate with all MPC nodes to sign a sweep transaction"
    echo "4. Send all funds from old GG18 address to new CGG21MP address"
    echo ""
    echo "Example sweep process:"
    echo "  - Old GG18 Address: 0x... (check exports/)"
    echo "  - New CGG21MP Address: 0x... (check docker logs)"
    echo "  - Use bridge-server API to initiate sweep transaction"
    echo ""
    echo "API call example:"
    echo 'curl -X POST http://localhost:3000/api/v1/sweep \\'
    echo '  -H "Content-Type: application/json" \\'
    echo '  -d "{"from": "gg18", "to": "cgg21mp", "confirm": true}"'
}

# Main menu
echo ""
echo "Select operation:"
echo "1. Export keys from current deployment"
echo "2. Analyze exported keys"
echo "3. Create new CGG21MP wallet"
echo "4. Show sweep instructions"
echo "5. Full migration (all steps)"
echo ""
read -p "Enter choice (1-5): " choice

case $choice in
    1)
        if [ "$USE_K8S" = true ]; then
            export_k8s_keys
        else
            export_docker_keys
        fi
        ;;
    2)
        analyze_keys
        ;;
    3)
        create_new_wallet
        ;;
    4)
        display_sweep_instructions
        ;;
    5)
        # Full migration
        if [ "$USE_K8S" = true ]; then
            export_k8s_keys
        else
            export_docker_keys
        fi
        analyze_keys
        generate_migration_config
        create_new_wallet
        display_sweep_instructions
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=== Migration tool completed ==="