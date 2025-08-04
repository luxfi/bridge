# MPC Go Integration Guide

## Overview

The Lux Bridge uses the `github.com/luxfi/mpc` package directly via Go tooling, eliminating the need for separate Docker containers or service implementations. This provides a cleaner, more integrated approach to running MPC nodes.

## Installation

### Prerequisites
- Go 1.22 or later
- Access to infrastructure services (NATS, Consul, KMS, Lux ID)

### Installing MPC Tools

```bash
# Install all MPC tools
make install-mpc

# Or manually install individual tools
go install github.com/luxfi/mpc/cmd/lux-mpc@latest
go install github.com/luxfi/mpc/cmd/lux-mpc-keygen@latest
go install github.com/luxfi/mpc/cmd/lux-mpc-cli@latest
```

## Architecture

### MPC Network
- **3 nodes** for 2-of-3 threshold signatures
- **HTTP API** on ports 6000-6002
- **gRPC** on ports 9090-9092
- **NATS** for inter-node communication
- **Consul** for service discovery
- **KMS** for secure key storage
- **Lux ID** for authentication

### Integration with Bridge

```
Bridge UI → Bridge Server → MPC Nodes → Blockchain Networks
                               ↓
                        KMS + Lux ID
```

## Running MPC Network

### 1. Start Infrastructure

```bash
# Start all infrastructure services
make up

# This launches:
# - Lux ID (Casdoor) - Port 8000
# - KMS (Vault) - Port 8200
# - NATS - Port 4223
# - Consul - Port 8501
# - PostgreSQL - Port 5433
# - Lux ID DB - Port 5434
```

### 2. Start MPC Nodes

```bash
# Start the 3-node MPC network
make start-mpc-nodes

# This runs:
# - mpc-node-0 on ports 6000 (HTTP) and 9090 (gRPC)
# - mpc-node-1 on ports 6001 (HTTP) and 9091 (gRPC)
# - mpc-node-2 on ports 6002 (HTTP) and 9092 (gRPC)
```

### 3. Check Status

```bash
# Check MPC node status
lux-mpc-cli status --url http://localhost:6000

# View logs
tail -f logs/mpc-node-0.log
tail -f logs/mpc-node-1.log
tail -f logs/mpc-node-2.log
```

### 4. Stop Network

```bash
# Stop MPC nodes
make stop-mpc-nodes

# Stop infrastructure
make down
```

## Configuration

### Environment Variables

```bash
# NATS Configuration
NATS_URL=nats://localhost:4223

# Consul Configuration
CONSUL_URL=http://localhost:8501

# KMS Configuration
KMS_URL=http://localhost:8200
KMS_TOKEN=myroot
KMS_PROJECT_ID=mpc-bridge
KMS_SECRET_PATH=/mpc

# Lux ID Configuration
LUXID_URL=http://localhost:8000
LUXID_CLIENT_ID=mpc-node-{id}
LUXID_CLIENT_SECRET=mpc-secret
```

### Configuration Files

- `config/mpc/config.yaml` - Main MPC configuration
- `config/mpc/peers.json` - Peer identities
- `data/mpc/node{0,1,2}/` - Node data directories

## Key Management

### Key Generation

```bash
# Generate new MPC keys
lux-mpc-keygen --threshold 2 --total 3

# Generate peer configuration
lux-mpc-cli generate-peers --number 3 --output config/mpc/peers.json
```

### Key Storage

Keys are stored in two locations:
1. **Local**: `data/mpc/node{id}/keys/`
2. **KMS**: Encrypted and stored in Vault at `/mpc/{node-id}/key-share`

## Operations

### Bridge Operations

```bash
# Initiate key generation for a new wallet
lux-mpc-cli keygen --wallet bridge-ethereum --threshold 2

# Request signature
lux-mpc-cli sign --wallet bridge-ethereum --message "0x..."

# List active sessions
lux-mpc-cli sessions --url http://localhost:6000
```

### Monitoring

```bash
# Check node health
curl http://localhost:6000/health

# View Consul services
consul catalog services

# Check NATS connections
nats-sub -s nats://localhost:4223 "bridge.mpc.>"
```

## Security

### Authentication Flow
1. MPC nodes authenticate with Lux ID
2. Obtain JWT tokens for API access
3. Use machine identity for service-to-service auth

### Key Security
- Keys never exist in complete form
- Threshold signatures require 2 of 3 nodes
- All keys encrypted at rest in KMS
- Audit logging for all operations

## Troubleshooting

### Common Issues

1. **MPC tools not found**
   ```bash
   # Add Go bin to PATH
   export PATH="$PATH:$(go env GOPATH)/bin"
   ```

2. **Connection failures**
   - Check infrastructure services are running with `docker ps`
   - Verify network connectivity
   - Check firewall rules

3. **Key generation fails**
   - Ensure all 3 nodes are running
   - Check NATS connectivity on port 4223
   - Verify Consul registration on port 8501

4. **Identity file errors**
   - Generate identity files: `lux-mpc-cli generate-identity --node nodeX --peers config/mpc/peers.json --output-dir data/mpc/nodeX`
   - Ensure all nodes have access to all identity files
   - Check file permissions

### Debug Mode

```bash
# Run with debug logging
LOG_LEVEL=debug make start-mpc-nodes

# Enable verbose output
lux-mpc-cli --verbose status
```

## Development

### Building from Source

```bash
# Clone MPC repository
git clone https://github.com/luxfi/mpc.git
cd mpc

# Build all binaries
make build

# Run tests
make test
```

### Integration Testing

```bash
# Run MPC integration tests
cd test && ./test-mpc-e2e.sh

# Test bridge integration
./test-bridge-integration.sh
```

## Migration from Docker

If migrating from the Docker-based setup:

1. Stop all Docker containers
2. Install MPC tools via `go install`
3. Copy any existing keys from Docker volumes
4. Start MPC nodes with the new setup
5. Verify operations with test transactions

## Benefits of Go Integration

1. **Simplified Deployment** - No Docker overhead
2. **Direct Integration** - Use MPC as a Go library
3. **Better Performance** - Native binaries
4. **Easier Development** - Standard Go tooling
5. **Unified Codebase** - Single repository for all MPC code

## Future Enhancements

- Automated key rotation
- Multi-region deployment
- Hardware security module integration
- Advanced monitoring and alerting