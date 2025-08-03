# CI/CD Docker Images Documentation

## Overview

The Lux Bridge project uses GitHub Actions to automatically build and push Docker images to GitHub Container Registry (ghcr.io) whenever changes are pushed to the main branch.

## Docker Images Built

The CI/CD pipeline builds three main Docker images:

1. **MPC Service**: `ghcr.io/luxfi/lux-mpc:latest`
2. **Bridge Server**: `ghcr.io/luxfi/bridge-server:latest`
3. **Bridge UI**: `ghcr.io/luxfi/bridge-ui:latest`

## Workflow Configuration

The workflow is defined in `.github/workflows/build-and-push.yml` and:

- Triggers on push to `main` branch
- Triggers on changes to relevant directories
- Can be manually triggered via workflow_dispatch
- Builds multi-platform images (linux/amd64, linux/arm64)
- Uses GitHub's built-in GITHUB_TOKEN for authentication

## Image Tags

Each image is tagged with:
- `latest` - for the main branch
- `main-<sha>` - specific commit on main
- `pr-<number>` - for pull requests
- Branch name - for feature branches

## Using the Images

### Development (compose.yml)
```yaml
services:
  mpc-node-0:
    image: ghcr.io/luxfi/lux-mpc:latest
  
  bridge-server:
    image: ghcr.io/luxfi/bridge-server:latest
  
  bridge-ui:
    image: ghcr.io/luxfi/bridge-ui:latest
```

### Local Development (compose.local.yml)
For local development without Docker images, use:
```bash
make up  # Starts infrastructure only
# Then run services locally
```

## Manual Build and Push

To manually build and push images:

```bash
# Build all images
make build

# Push to registry (requires login)
make push
```

## GitHub Container Registry Access

Images are public and can be pulled without authentication:
```bash
docker pull ghcr.io/luxfi/lux-mpc:latest
docker pull ghcr.io/luxfi/bridge-server:latest
docker pull ghcr.io/luxfi/bridge-ui:latest
```

## Troubleshooting

### Image Not Found
If you get "manifest unknown" errors:
1. Check if the workflow has run successfully
2. Verify image names match exactly
3. Use `compose.local.yml` for local development

### Build Failures
Common issues:
- Missing dependencies in Dockerfile
- Incorrect build context paths
- Network issues during build

### Local Testing
Test the build locally:
```bash
# MPC Service
docker build -f app/mpc-service/Dockerfile .

# Bridge Server
docker build -f app/server/Dockerfile app/server/

# Bridge UI
docker build -f app/bridge/Dockerfile app/bridge/
```

## Security

- Images are scanned for vulnerabilities by GitHub
- Use specific tags in production, not `latest`
- Regularly update base images
- Follow least-privilege principles in Dockerfiles