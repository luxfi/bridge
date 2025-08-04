#!/bin/bash
# Script to push changes and create release when network is available

echo "==================================="
echo "Pushing MPC Native Integration"
echo "==================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to check network connectivity
check_network() {
    echo "Checking network connectivity..."
    if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
        echo -e "${GREEN}✅ GitHub SSH connection successful${NC}"
        return 0
    else
        echo -e "${RED}❌ Cannot connect to GitHub${NC}"
        return 1
    fi
}

# Function to push changes
push_changes() {
    echo -e "\n${YELLOW}Pushing changes to main branch...${NC}"
    
    # Switch back to main
    git checkout main
    
    # Push commits
    if git push origin main; then
        echo -e "${GREEN}✅ Successfully pushed commits${NC}"
    else
        echo -e "${RED}❌ Failed to push commits${NC}"
        return 1
    fi
    
    # Push tags
    if git push origin v1.0.0; then
        echo -e "${GREEN}✅ Successfully pushed tag v1.0.0${NC}"
    else
        echo -e "${RED}❌ Failed to push tag${NC}"
        return 1
    fi
    
    return 0
}

# Function to create GitHub release
create_release() {
    echo -e "\n${YELLOW}Creating GitHub release...${NC}"
    
    gh release create v1.0.0 \
        --title "v1.0.0: Native MPC Integration" \
        --notes "## 🚀 Major Release: Native MPC Integration

### 🔄 Major Changes
- Migrated from Docker-based MPC service to native Go integration
- Added infrastructure services: Lux ID (auth), KMS (Vault), NATS, Consul
- Implemented 3-node MPC network with native Go binaries
- Added comprehensive E2E testing in CI/CD
- Improved performance and simplified deployment

### 💔 Breaking Changes
- Removed \`app/mpc-service\` directory
- Changed MPC deployment from Docker to native binaries
- Updated development workflow

### ✨ New Features
- Direct integration with \`github.com/luxfi/mpc\` package
- Unified authentication with Lux ID (Casdoor)
- Secure key management with HashiCorp Vault
- Service discovery with Consul
- Inter-node messaging with NATS

### 📚 Documentation
- Added [MPC Go Integration Guide](docs/MPC-GO-INTEGRATION.md)
- Updated README with new architecture
- Added installation and startup scripts

### 🔧 Development
To use the new MPC setup:
\`\`\`bash
# Install MPC tools
make install-mpc

# Start infrastructure
make up

# Start MPC nodes
make start-mpc-nodes
\`\`\`

### 🧪 Testing
- Updated integration tests for new architecture
- Added dedicated MPC E2E test workflow
- All CI/CD pipelines updated for native MPC

### 📦 Assets
No binary assets for this release. MPC tools are installed via Go." \
        --generate-notes
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Successfully created GitHub release${NC}"
    else
        echo -e "${RED}❌ Failed to create release${NC}"
        return 1
    fi
}

# Function to check CI status
check_ci_status() {
    echo -e "\n${YELLOW}Checking CI/CD status...${NC}"
    
    # Get workflow runs
    gh run list --limit 5 --json headBranch,status,conclusion,name | jq -r '.[] | "\(.name): \(.status) - \(.conclusion)"'
    
    echo -e "\n${YELLOW}Waiting for CI to complete...${NC}"
    # Wait for workflows to complete (with timeout)
    timeout=600 # 10 minutes
    elapsed=0
    while [ $elapsed -lt $timeout ]; do
        # Check if any workflows are in progress
        in_progress=$(gh run list --limit 5 --json status | jq -r '.[] | select(.status == "in_progress")' | wc -l)
        
        if [ "$in_progress" -eq 0 ]; then
            echo -e "${GREEN}✅ All workflows completed${NC}"
            break
        fi
        
        echo "Workflows still running... ($elapsed/$timeout seconds)"
        sleep 30
        elapsed=$((elapsed + 30))
    done
    
    # Check for failed workflows
    failed=$(gh run list --limit 5 --json conclusion | jq -r '.[] | select(.conclusion == "failure")' | wc -l)
    if [ "$failed" -gt 0 ]; then
        echo -e "${RED}❌ Some workflows failed${NC}"
        gh run list --limit 5 --json name,conclusion | jq -r '.[] | select(.conclusion == "failure") | .name'
        return 1
    fi
    
    echo -e "${GREEN}✅ All CI/CD checks passed${NC}"
    return 0
}

# Main execution
main() {
    echo "Starting push and release process..."
    
    # Check network
    if ! check_network; then
        echo -e "${RED}Cannot proceed without network connectivity${NC}"
        exit 1
    fi
    
    # Push changes
    if ! push_changes; then
        echo -e "${RED}Failed to push changes${NC}"
        exit 1
    fi
    
    # Wait a bit for GitHub to process
    sleep 5
    
    # Check CI status
    check_ci_status
    
    # Create release
    if ! create_release; then
        echo -e "${RED}Failed to create release${NC}"
        exit 1
    fi
    
    echo -e "\n${GREEN}==================================="
    echo "✅ Successfully completed!"
    echo "===================================${NC}"
    echo ""
    echo "Summary:"
    echo "- Pushed commits to main branch"
    echo "- Pushed tag v1.0.0"
    echo "- Created GitHub release"
    echo "- CI/CD status checked"
    echo ""
    echo "View the release at: https://github.com/luxfi/bridge/releases/tag/v1.0.0"
}

# Run main function
main "$@"