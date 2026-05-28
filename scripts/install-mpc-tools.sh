#!/bin/bash
set -euo pipefail

echo "==================================="
echo "Installing Lux MPC Tools"
echo "==================================="
echo ""

if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.26 or later."
    exit 1
fi

echo "✅ Go is installed: $(go version)"
echo ""

MPC_MODULE="github.com/luxfi/mpc"
MPC_VERSION="${MPC_VERSION:-latest}"
GOBIN_DIR="$(go env GOPATH)/bin"
mkdir -p "$GOBIN_DIR"

# Upstream renamed cmd/lux-mpc → cmd/mpcd and cmd/lux-mpc-cli → cmd/mpc, and
# its go.mod contains replace directives — so `go install pkg@version` won't
# work. We resolve the requested version through the module cache, copy the
# source to a writable scratch dir, refresh go.sum (the upstream sum can
# drift when replace-target tags are republished), then `go build -o` into
# $GOBIN with the daemon/CLI names the rest of the bridge scripts expect.

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "Resolving $MPC_MODULE@$MPC_VERSION ..."
cd "$WORKDIR"
go mod init bridge-mpc-installer >/dev/null
go mod download -x "$MPC_MODULE@$MPC_VERSION" 2>&1 | tail -1

# Find the resolved version in the module cache (handles MPC_VERSION=latest).
RESOLVED_VERSION="$(go list -m -f '{{.Version}}' "$MPC_MODULE@$MPC_VERSION")"
SRC="$(go env GOMODCACHE)/${MPC_MODULE}@${RESOLVED_VERSION}"
echo "Resolved version: $RESOLVED_VERSION"

BUILD_DIR="$WORKDIR/build"
cp -r "$SRC" "$BUILD_DIR"
chmod -R u+w "$BUILD_DIR"

cd "$BUILD_DIR"
# Drop the workspace file — upstream's go.work references sibling modules
# (../threshold, e2e) that aren't shipped in the module zip.
rm -f go.work go.work.sum
# Refresh go.sum against the current proxy contents (the committed sum can
# mismatch when replace-target tags get republished).
rm -f go.sum
GOWORK=off go mod tidy >/dev/null 2>&1

echo "Building mpcd (daemon)..."
GOWORK=off go build -o "$GOBIN_DIR/mpcd" ./cmd/mpcd

echo "Building mpc (CLI)..."
GOWORK=off go build -o "$GOBIN_DIR/mpc" ./cmd/mpc

# Bridge scripts call these by their pre-rename names; keep them working
# via symlinks rather than touching every call site.
ln -sf "$GOBIN_DIR/mpcd" "$GOBIN_DIR/lux-mpc"
ln -sf "$GOBIN_DIR/mpc"  "$GOBIN_DIR/lux-mpc-cli"

echo ""
echo "Verifying installations..."
echo ""

if command -v lux-mpc &> /dev/null; then
    echo "✅ lux-mpc installed: $(which lux-mpc) -> $(readlink -f "$(which lux-mpc)")"
else
    echo "⚠️  lux-mpc installed but not in PATH. Add $GOBIN_DIR to your PATH."
fi

if command -v lux-mpc-cli &> /dev/null; then
    echo "✅ lux-mpc-cli installed: $(which lux-mpc-cli) -> $(readlink -f "$(which lux-mpc-cli)")"
else
    echo "⚠️  lux-mpc-cli installed but not in PATH."
fi

echo ""
echo "==================================="
echo "Installation Complete!"
echo "==================================="
echo ""
echo "If tools are not in your PATH, add this to your shell profile:"
echo "  export PATH=\"\$PATH:$GOBIN_DIR\""
echo ""
echo "Available commands:"
echo "  lux-mpc      - Main MPC node daemon (symlink to mpcd)"
echo "  lux-mpc-cli  - CLI client for MPC operations (symlink to mpc)"
echo ""
echo "To start a local MPC network:"
echo "  ./scripts/start-mpc-network.sh"
