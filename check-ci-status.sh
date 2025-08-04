#!/bin/bash
# Script to check CI/CD status and ensure all components are green

echo "==================================="
echo "CI/CD Status Check"
echo "==================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to check workflow status
check_workflows() {
    echo -e "\n${BLUE}Checking GitHub Actions workflows...${NC}"
    
    # List recent workflow runs
    echo -e "\nRecent workflow runs:"
    gh run list --limit 10 --json name,status,conclusion,createdAt | \
        jq -r '.[] | "\(.createdAt | split("T")[0]) \(.name): \(.status) - \(.conclusion // "pending")"'
    
    # Check specific workflows
    echo -e "\n${YELLOW}Checking critical workflows:${NC}"
    
    # Check MPC E2E Tests
    echo -n "MPC E2E Tests: "
    mpc_status=$(gh run list --workflow="MPC E2E Tests" --limit 1 --json conclusion | jq -r '.[0].conclusion // "not run"')
    if [ "$mpc_status" = "success" ]; then
        echo -e "${GREEN}✅ Passed${NC}"
    else
        echo -e "${RED}❌ $mpc_status${NC}"
    fi
    
    # Check Integration Tests
    echo -n "Integration Tests: "
    int_status=$(gh run list --workflow="Integration Tests" --limit 1 --json conclusion | jq -r '.[0].conclusion // "not run"')
    if [ "$int_status" = "success" ]; then
        echo -e "${GREEN}✅ Passed${NC}"
    else
        echo -e "${RED}❌ $int_status${NC}"
    fi
    
    # Check Build and Push
    echo -n "Build and Push Images: "
    build_status=$(gh run list --workflow="Build and Push Images" --limit 1 --json conclusion | jq -r '.[0].conclusion // "not run"')
    if [ "$build_status" = "success" ]; then
        echo -e "${GREEN}✅ Passed${NC}"
    else
        echo -e "${RED}❌ $build_status${NC}"
    fi
}

# Function to check build artifacts
check_artifacts() {
    echo -e "\n${BLUE}Checking build artifacts...${NC}"
    
    # Check container images
    echo -e "\n${YELLOW}Container images:${NC}"
    
    # Check if images exist
    for image in bridge-server bridge-ui; do
        echo -n "ghcr.io/luxfi/$image: "
        if gh api "/orgs/luxfi/packages/container/$image" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Available${NC}"
        else
            echo -e "${YELLOW}⚠️  Not found (may be private)${NC}"
        fi
    done
}

# Function to check branch protection
check_branch_protection() {
    echo -e "\n${BLUE}Checking branch protection...${NC}"
    
    # Check main branch protection
    echo -n "Main branch protection: "
    if gh api repos/luxfi/bridge/branches/main/protection >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Enabled${NC}"
        
        # Get required checks
        echo -e "\nRequired status checks:"
        gh api repos/luxfi/bridge/branches/main/protection/required_status_checks 2>/dev/null | \
            jq -r '.contexts[]' | sed 's/^/  - /'
    else
        echo -e "${YELLOW}⚠️  Not enabled${NC}"
    fi
}

# Function to run local tests
run_local_tests() {
    echo -e "\n${BLUE}Running local tests...${NC}"
    
    # Check if MPC E2E test script exists and is executable
    if [ -x "./test/test-mpc-e2e-simple.sh" ]; then
        echo -e "\n${YELLOW}Running MPC E2E test script...${NC}"
        ./test/test-mpc-e2e-simple.sh
    else
        echo -e "${YELLOW}⚠️  MPC E2E test script not found or not executable${NC}"
    fi
}

# Function to check dependencies
check_dependencies() {
    echo -e "\n${BLUE}Checking dependencies...${NC}"
    
    # Check Go version
    echo -n "Go version: "
    if command -v go >/dev/null 2>&1; then
        go_version=$(go version | awk '{print $3}')
        echo -e "${GREEN}✅ $go_version${NC}"
    else
        echo -e "${RED}❌ Not installed${NC}"
    fi
    
    # Check Node.js version
    echo -n "Node.js version: "
    if command -v node >/dev/null 2>&1; then
        node_version=$(node --version)
        echo -e "${GREEN}✅ $node_version${NC}"
    else
        echo -e "${RED}❌ Not installed${NC}"
    fi
    
    # Check pnpm version
    echo -n "pnpm version: "
    if command -v pnpm >/dev/null 2>&1; then
        pnpm_version=$(pnpm --version)
        echo -e "${GREEN}✅ $pnpm_version${NC}"
    else
        echo -e "${RED}❌ Not installed${NC}"
    fi
    
    # Check Docker
    echo -n "Docker: "
    if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Running${NC}"
    else
        echo -e "${RED}❌ Not running${NC}"
    fi
    
    # Check MPC tools
    echo -e "\n${YELLOW}MPC Tools:${NC}"
    for tool in lux-mpc lux-mpc-cli lux-mpc-bridge; do
        echo -n "$tool: "
        if command -v $tool >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Installed${NC}"
        else
            echo -e "${YELLOW}⚠️  Not installed (run 'make install-mpc')${NC}"
        fi
    done
}

# Function to generate summary
generate_summary() {
    echo -e "\n${BLUE}==================================="
    echo "CI/CD Status Summary"
    echo "===================================${NC}"
    
    echo -e "\n${YELLOW}Repository:${NC} luxfi/bridge"
    echo -e "${YELLOW}Branch:${NC} $(git branch --show-current)"
    echo -e "${YELLOW}Latest commit:${NC} $(git log -1 --oneline)"
    
    echo -e "\n${YELLOW}Recommendations:${NC}"
    echo "1. Ensure all workflows are passing before merging"
    echo "2. Check that container images are being built"
    echo "3. Verify MPC tools are installed for local development"
    echo "4. Run local E2E tests before pushing"
    
    echo -e "\n${YELLOW}Quick Actions:${NC}"
    echo "- View workflows: gh run list"
    echo "- Rerun failed workflow: gh run rerun <run-id>"
    echo "- View workflow logs: gh run view <run-id> --log"
    echo "- Trigger workflow: gh workflow run <workflow-name>"
}

# Main execution
main() {
    echo "Starting CI/CD status check..."
    
    # Check if we're in the right repository
    if ! git remote get-url origin | grep -q "luxfi/bridge"; then
        echo -e "${RED}❌ Not in the luxfi/bridge repository${NC}"
        exit 1
    fi
    
    # Run checks
    check_dependencies
    check_workflows
    check_artifacts
    check_branch_protection
    
    # Generate summary
    generate_summary
    
    echo -e "\n${GREEN}✅ CI/CD status check complete!${NC}"
}

# Run main function
main "$@"