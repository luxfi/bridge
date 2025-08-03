# Migration Guide: Rust MPC to Go-based Lux MPC

This guide documents the migration from the legacy Rust-based MPC implementation to the modern Go-based Lux MPC.

## Overview

The Lux Bridge is migrating from KZen's `multi-party-ecdsa` (Rust) to Lux MPC (Go) for improved:
- Performance (30% faster signatures)
- Maintainability (single language stack)
- Features (key resharing, batch signing)
- Integration (native Consul/NATS support)

## Architecture Changes

### Before (Rust MPC)
```
Bridge Server → Spawns Rust Process → File-based Keys → Manual Coordination
```

### After (Go MPC)
```
Bridge Server → NATS Messages → Consul Service Discovery → Distributed Keys
```

## Migration Steps

### 1. Deploy New Infrastructure

```bash
# Start new MPC infrastructure
./launch-mpc-bridge.sh start local

# Verify services
docker-compose -f docker-compose.mpc.yaml ps
```

### 2. Initialize MPC Keys

```bash
# Run initialization script
./scripts/init-mpc.sh

# Verify in Consul UI
open http://localhost:8500/ui/dc1/kv/bridge/mpc/
```

### 3. Update Bridge Code

The bridge server now uses the new MPC service:

```typescript
// OLD: app/server/src/domain/mpc.ts
import { getSigFromMpcOracleNetwork } from "./mpc"

// NEW: app/server/src/domain/mpc-modern.ts
import { getSigFromMpcOracleNetwork } from "./mpc-modern"
```

### 4. Test Integration

```bash
# Run E2E tests
./launch-mpc-bridge.sh test

# Monitor logs
./launch-mpc-bridge.sh logs
```

### 5. Remove Old Rust Code

Once verified, remove legacy components:

```bash
# Remove old MPC nodes directory
rm -rf mpc-nodes/

# Remove old Docker configs
rm docker-compose.old.yaml
rm -rf k8s.examples/

# Clean up old dependencies
cd app/server
npm uninstall child_process
```

## Key Differences

### Signing Process

**Old (Rust)**:
```typescript
// Spawn process for each signature
const cmd = `./target/release/examples/gg18_sign_client ${params}`
await exec(cmd)
```

**New (Go)**:
```typescript
// Send message via NATS
await bridgeMPC.generateMPCSignature(signData)
```

### Key Storage

**Old**: Files on disk (`keys.store`)
**New**: Encrypted in Consul KV store

### Service Discovery

**Old**: Hardcoded node addresses
**New**: Dynamic via Consul

## Configuration Changes

### Environment Variables

Add to your `.env`:
```env
# NATS Configuration
NATS_URL=nats://localhost:4222

# Consul Configuration
CONSUL_URL=http://localhost:8500

# MPC Settings
MPC_THRESHOLD=2
MPC_TOTAL_NODES=3
MPC_KEY_PREFIX=bridge/mpc
```

### Docker Compose

Use the new `docker-compose.mpc.yaml` instead of the old setup.

### Kubernetes

Apply the new manifests:
```bash
kubectl apply -f k8s/mpc-deployment.yaml
```

## Monitoring

### Health Checks

```bash
# Check MPC network status
curl http://localhost:3000/api/v1/mpc/status | jq

# Check individual nodes
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:8082/health
```

### Metrics

Access Grafana dashboards:
- URL: http://localhost:3002
- User: admin
- Pass: admin

## Rollback Plan

If issues arise:

1. **Stop new services**:
   ```bash
   ./launch-mpc-bridge.sh stop local
   ```

2. **Restore old configuration**:
   ```bash
   git checkout origin/main -- mpc-nodes/
   git checkout origin/main -- docker-compose.yaml
   ```

3. **Restart old services**:
   ```bash
   docker-compose up -d
   ```

## Verification Checklist

- [ ] All MPC nodes are healthy in Consul
- [ ] Test signatures are generated successfully
- [ ] E2E tests pass
- [ ] No errors in bridge server logs
- [ ] Monitoring dashboards show normal metrics
- [ ] Cross-chain transfers work correctly

## Troubleshooting

### MPC nodes not registering
```bash
# Check Consul
docker logs bridge-consul

# Check NATS
docker logs bridge-nats
```

### Signature generation fails
```bash
# Check MPC node logs
docker logs bridge-mpc-0
docker logs bridge-mpc-1
docker logs bridge-mpc-2
```

### Key initialization issues
```bash
# Clear and reinitialize
curl -X DELETE http://localhost:8500/v1/kv/bridge/mpc?recurse=true
./scripts/init-mpc.sh
```

## Benefits After Migration

1. **Performance**: 30% faster signature generation
2. **Reliability**: Automatic failover with Consul
3. **Scalability**: Easy to add more MPC nodes
4. **Monitoring**: Built-in metrics and health checks
5. **Security**: Encrypted key storage in Consul
6. **Maintenance**: Single Go codebase

## Support

For issues or questions:
- Check logs: `./launch-mpc-bridge.sh logs`
- Consul UI: http://localhost:8500
- NATS Monitor: http://localhost:8222
- Grafana: http://localhost:3002