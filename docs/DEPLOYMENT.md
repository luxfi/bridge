# Bridge Deployment Guide

This guide covers the deployment of the Lux Bridge ecosystem using Docker Compose and the migration from GG18 to CGG21MP MPC protocol.

## Quick Start

### Local Development
```bash
# Start local development environment
make up
# or
make dev

# View logs
make logs

# Stop services
make down
```

### Production Deployment

#### Mainnet
```bash
# Set environment variables
cp .env.example .env.mainnet
# Edit .env.mainnet with production values

# Start mainnet deployment
make mainnet

# Monitor services
make logs
```

#### Testnet
```bash
# Start testnet deployment
make testnet
```

## Architecture

The bridge consists of:
- **3 MPC Nodes**: Threshold signature nodes (2-of-3)
- **Bridge Server**: API server handling bridge operations
- **Bridge UI**: Web interface for users
- **Infrastructure**: NATS, Consul, PostgreSQL
- **Monitoring**: Prometheus & Grafana

## Docker Images

All images are hosted on GitHub Container Registry:
- `ghcr.io/luxfi/bridge-mpc:latest`
- `ghcr.io/luxfi/bridge-server:latest`
- `ghcr.io/luxfi/bridge-ui:latest`

### Building Images
```bash
# Build all images with multi-platform support
make build

# Push to registry (requires login)
make login
make push
```

## MPC Key Management

### Exporting Keys
```bash
# Export keys from running deployment
make export-keys

# Keys will be saved to exports/mpc-keys/
```

### Migration from GG18 to CGG21MP

The bridge supports migration from the legacy GG18 protocol to the newer CGG21MP protocol.

```bash
# Run migration tool
./scripts/migrate-mpc-keys.sh

# Options:
# 1. Export keys from current deployment
# 2. Analyze exported keys
# 3. Create new CGG21MP wallet
# 4. Show sweep instructions
# 5. Full migration (all steps)
```

#### Migration Process
1. **Export existing GG18 keys** from Kubernetes or Docker deployment
2. **Create new CGG21MP wallet** with fresh keys
3. **Sweep funds** from old GG18 address to new CGG21MP address
4. **Update configuration** to use new wallet

### Kubernetes to Docker Migration
If migrating from a Kubernetes deployment:
```bash
# Export from K8s
kubectl exec <mpc-pod> -- cat /data/mpc/keys/node_key.json > old-keys.json

# Import to Docker
docker cp old-keys.json bridge-mpc-0:/data/mpc/keys/
```

## Configuration

### Environment Variables
Key environment variables for each service:

#### MPC Nodes
- `NODE_ID`: Unique identifier for the node
- `MPC_THRESHOLD`: Signature threshold (2)
- `MPC_TOTAL_NODES`: Total nodes (3)
- `MPC_PROTOCOL`: Protocol version (CGG21MP)

#### Bridge Server
- `DATABASE_URL`: PostgreSQL connection string
- `NATS_URL`: NATS messaging server
- `CONSUL_URL`: Consul service discovery
- `NETWORK`: Network type (mainnet/testnet)

### Network Configuration
- **Mainnet**: Production network with TLS, monitoring, backups
- **Testnet**: Testing network with debug logging, faucet
- **Local**: Development with hot-reloading

## Security

### Best Practices
1. **Never commit keys** - Use `.gitignore` patterns
2. **Use TLS in production** - Certificates in `certs/`
3. **Secure PostgreSQL** - Strong passwords, SSL mode
4. **Network isolation** - Use Docker networks
5. **Regular backups** - Automated backup service

### Backup and Recovery
```bash
# Create full backup
make backup

# Backups include:
# - PostgreSQL database
# - MPC key material
# - Configuration files
```

## Monitoring

### Prometheus Metrics
- Available at: `http://localhost:9094`
- Metrics exported by all services
- Custom dashboards for MPC operations

### Grafana Dashboards
- Available at: `http://localhost:3002`
- Default login: admin/admin (change in production)
- Pre-configured dashboards for:
  - MPC node health
  - Bridge transactions
  - System resources

## Troubleshooting

### Common Issues

1. **MPC nodes not syncing**
   ```bash
   # Check consul status
   docker exec bridge-consul consul members
   
   # Check NATS connectivity
   docker exec bridge-nats nats-server --help
   ```

2. **Database connection issues**
   ```bash
   # Check PostgreSQL
   docker exec bridge-postgres pg_isready
   
   # View logs
   docker logs bridge-postgres
   ```

3. **Key export failures**
   ```bash
   # Check file permissions
   docker exec bridge-mpc-0 ls -la /data/mpc/keys/
   
   # Verify node is running
   docker ps | grep mpc
   ```

### Debug Mode
```bash
# Start with debug logging
LOG_LEVEL=debug docker compose up

# Attach to container
docker exec -it bridge-mpc-0 sh
```

## CI/CD

GitHub Actions workflow automatically:
1. Builds multi-platform images (amd64, arm64)
2. Runs tests
3. Pushes to ghcr.io/luxfi registry
4. Tags with branch name and commit SHA

Triggered on:
- Push to main branch
- Pull requests
- Manual workflow dispatch

## Support

For issues or questions:
1. Check logs: `make logs`
2. Review configuration
3. Open GitHub issue
4. Contact team on Discord