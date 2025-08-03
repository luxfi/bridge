# Local Bridge Setup with MPC

Since the ghcr.io Docker images are not yet published, here's how to run the bridge locally with the MPC nodes.

## Current Status

✅ **MPC Nodes are already running locally!**
- node0: http://localhost:8080
- node1: http://localhost:8081  
- node2: http://localhost:8082

The nodes are configured and ready to accept MPC requests.

## Quick Start

### 1. Keep MPC Nodes Running
The MPC nodes are already running from our previous setup. You can verify with:
```bash
ps aux | grep lux-mpc
```

### 2. Start Infrastructure Services
Since Docker networking is having issues, run these locally:

```bash
# Start NATS (if not running)
docker run -d --name nats -p 4222:4222 -p 8222:8222 nats:latest -js

# Start Consul (if not running)
consul agent -dev -client=0.0.0.0
```

### 3. Start Bridge Server
```bash
cd app/server
pnpm install
pnpm dev
```

### 4. Start Bridge UI
```bash
cd app/bridge
pnpm install
pnpm dev
```

## Alternative: Fix Docker Images

To use the proper Docker setup, the ghcr.io images need to be built and pushed:

1. **Login to GitHub Container Registry**:
```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

2. **Build and Push Images**:
```bash
# Build images locally first
docker build -t ghcr.io/luxfi/bridge-mpc:latest ./mpc-service
docker build -t ghcr.io/luxfi/bridge-server:latest ./app/server
docker build -t ghcr.io/luxfi/bridge-ui:latest ./app/bridge

# Push to registry
docker push ghcr.io/luxfi/bridge-mpc:latest
docker push ghcr.io/luxfi/bridge-server:latest
docker push ghcr.io/luxfi/bridge-ui:latest
```

3. **Then use Docker Compose**:
```bash
make up
```

## Current Infrastructure

- **NATS**: Already running on port 4222
- **Consul**: Already running on port 8500
- **MPC Nodes**: Running locally with the lux-mpc binary
- **Database**: Can use existing PostgreSQL or run: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=bridge postgres`

The bridge is ready for development and testing!