#!/bin/bash

echo "==================================="
echo "Installing Lux MPC Tools"
echo "==================================="
echo ""

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.22 or later."
    exit 1
fi

echo "✅ Go is installed: $(go version)"
echo ""

# Install MPC CLI tools
echo "Installing MPC CLI tools..."
echo ""

# Install the main MPC CLI
echo "Installing lux-mpc..."
go install github.com/luxfi/mpc/cmd/lux-mpc@latest

# Install the MPC bridge tool
echo "Installing lux-mpc-bridge..."
go install github.com/luxfi/mpc/cmd/lux-mpc-bridge@latest

# Install the MPC CLI client
echo "Installing lux-mpc-cli..."
go install github.com/luxfi/mpc/cmd/lux-mpc-cli@latest

# Check installations
echo ""
echo "Verifying installations..."
echo ""

# Check if binaries are in PATH
if command -v lux-mpc &> /dev/null; then
    echo "✅ lux-mpc installed: $(which lux-mpc)"
else
    echo "⚠️  lux-mpc installed but not in PATH. Add $(go env GOPATH)/bin to your PATH."
fi

if command -v lux-mpc-bridge &> /dev/null; then
    echo "✅ lux-mpc-bridge installed: $(which lux-mpc-bridge)"
else
    echo "⚠️  lux-mpc-bridge installed but not in PATH."
fi

if command -v lux-mpc-cli &> /dev/null; then
    echo "✅ lux-mpc-cli installed: $(which lux-mpc-cli)"
else
    echo "⚠️  lux-mpc-cli installed but not in PATH."
fi

echo ""
echo "==================================="
echo "Installation Complete!"
echo "==================================="
echo ""
echo "If tools are not in your PATH, add this to your shell profile:"
echo "  export PATH=\"\$PATH:\$(go env GOPATH)/bin\""
echo ""
echo "Available commands:"
echo "  lux-mpc         - Main MPC node daemon"
echo "  lux-mpc-bridge  - MPC bridge tool"
echo "  lux-mpc-cli     - CLI client for MPC operations"
echo ""
echo "To start a local MPC network:"
echo "  ./scripts/start-mpc-network.sh"