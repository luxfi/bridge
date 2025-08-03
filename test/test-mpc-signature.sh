#!/bin/bash

echo "=== Testing MPC Signature Generation ==="
echo

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

echo "Test transaction data:"
echo "$PAYLOAD" | jq .
echo

# Test the MPC oracle network endpoint
echo "Testing MPC signature generation..."
curl -s -X POST http://localhost:5000/api/swaps/getsig \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .

echo
echo "=== Test Complete ==="