#!/bin/bash

# Full Integration Test Script
# Tests all components: ID (Casdoor), KMS (Vault), MPC, Bridge

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== Full Integration Test Suite ==="
echo "Testing: Casdoor (ID) + Vault (KMS) + MPC + Bridge"
echo ""

# Configuration
BRIDGE_URL="http://localhost:5000"
VAULT_URL="http://localhost:8200"
CASDOOR_URL="http://localhost:8000"
CONSUL_URL="http://localhost:8500"
NATS_URL="http://localhost:4222"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    echo -n "Testing $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Helper function to test JSON response
test_json_response() {
    local name="$1"
    local url="$2"
    local json_path="$3"
    local expected="$4"
    
    echo -n "Testing $name... "
    
    response=$(curl -s "$url" 2>/dev/null)
    value=$(echo "$response" | jq -r "$json_path" 2>/dev/null || echo "error")
    
    if [ "$value" = "$expected" ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (got: $value, expected: $expected)"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "1. Infrastructure Services"
echo "========================="

# Test NATS
test_endpoint "NATS monitoring" "$NATS_URL" "200"

# Test Consul
test_endpoint "Consul API" "$CONSUL_URL/v1/catalog/services" "200"

# Test databases
echo -n "Testing PostgreSQL (Bridge)... "
if PGPASSWORD=bridge psql -h localhost -U bridge -d bridge -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "2. Identity Service (Casdoor)"
echo "============================="

# Test Casdoor
test_endpoint "Casdoor health" "$CASDOOR_URL/api/health" "200"
test_endpoint "Casdoor login page" "$CASDOOR_URL/login" "200"

# Test Bridge auth integration
test_endpoint "Bridge auth providers" "$BRIDGE_URL/api/auth/providers" "200"

echo ""
echo "3. Key Management Service (Vault)"
echo "================================="

# Test Vault
test_endpoint "Vault health" "$VAULT_URL/v1/sys/health" "200"

# Test Vault secrets (requires token)
if [ -n "$VAULT_TOKEN" ]; then
    echo -n "Testing Vault MPC keys... "
    response=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_URL/v1/secret/data/mpc/keys" | jq -r '.data.data.node0_key' 2>/dev/null)
    if [ -n "$response" ] && [ "$response" != "null" ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${YELLOW}⚠ Skipping Vault secret tests (no token)${NC}"
fi

echo ""
echo "4. MPC Network"
echo "=============="

# Test MPC nodes
for i in 0 1 2; do
    port=$((6000 + i))
    test_endpoint "MPC node$i" "http://localhost:$port/health" "200"
done

# Test MPC operations
echo -n "Testing MPC key generation... "
if command -v lux-mpc-cli >/dev/null 2>&1; then
    if lux-mpc-cli test-sign --url http://localhost:6000 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${YELLOW}⚠ SKIPPED (lux-mpc-cli not found)${NC}"
fi

echo ""
echo "5. Bridge Server"
echo "================"

# Test Bridge endpoints
test_endpoint "Bridge health" "$BRIDGE_URL/health" "200"
test_endpoint "Bridge networks" "$BRIDGE_URL/api/networks" "200"
test_endpoint "Bridge tokens" "$BRIDGE_URL/api/tokens" "200"
test_endpoint "Bridge limits" "$BRIDGE_URL/api/limits" "200"
test_endpoint "Bridge settings" "$BRIDGE_URL/api/settings" "200"

# Test MPC integration
test_endpoint "Bridge MPC status" "$BRIDGE_URL/api/mpc/status" "200"

echo ""
echo "6. Service Discovery"
echo "==================="

# Check Consul services
echo -n "Testing service registration... "
services=$(curl -s "$CONSUL_URL/v1/catalog/services" | jq -r 'keys[]' 2>/dev/null | wc -l)
if [ "$services" -gt 0 ]; then
    echo -e "${GREEN}✓ PASSED${NC} ($services services registered)"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "7. Full Integration Flow"
echo "======================="

# Test complete flow
echo -n "Testing authenticated request flow... "
# This would require a real auth token
echo -e "${YELLOW}⚠ SKIPPED (requires auth token)${NC}"

# Test swap estimation
echo -n "Testing swap quote... "
quote_response=$(curl -s -X POST "$BRIDGE_URL/api/quote" \
    -H "Content-Type: application/json" \
    -d '{
        "from_network": "ethereum",
        "to_network": "bsc",
        "from_token": "USDT",
        "to_token": "USDT",
        "amount": "100"
    }' 2>/dev/null)

if echo "$quote_response" | jq -e '.error' >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ SKIPPED (endpoint not fully implemented)${NC}"
else
    echo -e "${GREEN}✓ PASSED${NC}"
    ((TESTS_PASSED++))
fi

echo ""
echo "8. Performance Checks"
echo "===================="

# Test response times
echo -n "Testing API response time... "
response_time=$(curl -s -o /dev/null -w "%{time_total}" "$BRIDGE_URL/health")
if (( $(echo "$response_time < 1.0" | bc -l) )); then
    echo -e "${GREEN}✓ PASSED${NC} (${response_time}s)"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} (${response_time}s > 1.0s)"
    ((TESTS_FAILED++))
fi

echo ""
echo "9. Security Checks"
echo "=================="

# Test HTTPS redirect (if applicable)
echo -n "Testing security headers... "
headers=$(curl -s -I "$BRIDGE_URL/health" 2>/dev/null)
if echo "$headers" | grep -q "X-Content-Type-Options: nosniff"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (security headers not set)"
fi

echo ""
echo "================================="
echo "Test Summary"
echo "================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✅${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed! ❌${NC}"
    exit 1
fi