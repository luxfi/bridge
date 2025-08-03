#!/bin/bash

echo "=== Complete MPC Bridge E2E Test ==="
echo

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "1. Infrastructure Status:"
echo "========================="

# Check NATS
if curl -s http://localhost:8223/varz > /dev/null; then
    echo -e "${GREEN}✅ NATS is running${NC}"
else
    echo -e "${RED}❌ NATS is not accessible${NC}"
fi

# Check Consul
if curl -s http://localhost:8501/v1/status/leader > /dev/null; then
    echo -e "${GREEN}✅ Consul is running${NC}"
else
    echo -e "${RED}❌ Consul is not accessible${NC}"
fi

# Check Bridge Server
if curl -s http://localhost:5000/health > /dev/null; then
    echo -e "${GREEN}✅ Bridge server is running${NC}"
else
    echo -e "${RED}❌ Bridge server is not accessible${NC}"
fi

echo
echo "2. MPC Service Status:"
echo "====================="

# Get MPC status from health endpoint
MPC_STATUS=$(curl -s http://localhost:5000/health | jq '.mpc')
echo "$MPC_STATUS" | jq .

TOTAL_NODES=$(echo "$MPC_STATUS" | jq -r '.totalNodes')
ACTIVE_NODES=$(echo "$MPC_STATUS" | jq -r '.activeNodes')
THRESHOLD=$(echo "$MPC_STATUS" | jq -r '.threshold')
READY=$(echo "$MPC_STATUS" | jq -r '.ready')

echo
echo "Summary:"
echo "- Total MPC nodes registered: $TOTAL_NODES"
echo "- Active MPC nodes: $ACTIVE_NODES"
echo "- Threshold required: $THRESHOLD"
echo "- MPC network ready: $READY"

echo
echo "3. Testing MPC Signature:"
echo "========================"

# Create test transaction data
TX_ID="0x$(openssl rand -hex 32)"
FROM_NETWORK_ID="1"
TO_NETWORK_ID="56"
TO_TOKEN_ADDRESS="0x0000000000000000000000000000000000000000"
MSG_SIGNATURE="0x$(openssl rand -hex 65)"
RECEIVER_HASH="0x$(echo -n "0x1234567890123456789012345678901234567890" | sha256sum | cut -d' ' -f1)"

# Create JSON payload
PAYLOAD=$(cat <<EOF
{
  "txId": "$TX_ID",
  "fromNetworkId": "$FROM_NETWORK_ID",
  "toNetworkId": "$TO_NETWORK_ID",
  "toTokenAddress": "$TO_TOKEN_ADDRESS",
  "msgSignature": "$MSG_SIGNATURE",
  "receiverAddressHash": "$RECEIVER_HASH"
}
EOF
)

echo "Test transaction:"
echo "$PAYLOAD" | jq -c .
echo

# Test the MPC signature endpoint
echo "Calling /api/swaps/getsig..."
RESPONSE=$(curl -s -X POST http://localhost:5000/api/swaps/getsig \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if echo "$RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Response:"
    echo "$RESPONSE" | jq .
    
    # Check if we got a valid signature
    if echo "$RESPONSE" | jq -e '.signature' >/dev/null 2>&1; then
        echo -e "${GREEN}✅ MPC signature generated successfully${NC}"
        SIGNATURE=$(echo "$RESPONSE" | jq -r '.signature')
        echo "Signature: $SIGNATURE"
    else
        echo -e "${YELLOW}⚠️  MPC signature generation returned an error${NC}"
        echo "This is expected if MPC nodes haven't completed key generation"
    fi
else
    echo -e "${RED}❌ Invalid response from server${NC}"
    echo "Response: $RESPONSE"
fi

echo
echo "4. Recommendations:"
echo "==================="

if [ "$READY" != "true" ]; then
    echo "The MPC network is not ready. To make it operational:"
    echo "1. Ensure all $THRESHOLD MPC nodes are running"
    echo "2. Wait for key generation protocol to complete"
    echo "3. Check MPC node logs for any errors"
    echo
    echo "Current status shows $TOTAL_NODES nodes registered but only $ACTIVE_NODES active."
else
    echo -e "${GREEN}The MPC network is ready for bridge operations!${NC}"
fi

echo
echo "5. Next Steps:"
echo "=============="
echo "1. Start the bridge UI: cd app/bridge && pnpm dev"
echo "2. Create a test bridge transaction through the UI"
echo "3. Monitor MPC signature generation in server logs"
echo "4. Verify transaction completion on destination chain"

echo
echo -e "${GREEN}=== E2E Test Complete ===${NC}"