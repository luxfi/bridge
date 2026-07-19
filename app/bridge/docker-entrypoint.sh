#!/bin/sh
# Generate /__ENV.js from container env at boot. Lets one image serve N envs.
#
# nginx:alpine looks in /docker-entrypoint.d/ for *.sh files and runs them
# before starting nginx. This file lands at /docker-entrypoint.d/40-render-env.sh
# via the Dockerfile.
#
# The SDK reads window.__ENV from /__ENV.js before falling back to
# build-time import.meta.env (see app/bridge/src/bridge.config.ts).
#
# Tenants (zoo, lux-mci, ...) copy this script verbatim — only the env
# var names need to match the keys the tenant's bridge.config.ts looks up.

set -eu

cat > /usr/share/nginx/html/__ENV.js <<EOF
window.__ENV = {
  BRIDGE_API_HOST: '${BRIDGE_API_HOST:-}',
  BRIDGE_ENV: '${BRIDGE_ENV:-}',
  BRIDGE_CLIENT_ID: '${BRIDGE_CLIENT_ID:-}',
  BRIDGE_IAM_ORG: '${BRIDGE_IAM_ORG:-}',
  BRIDGE_BRAND_NAME: '${BRIDGE_BRAND_NAME:-}',
  BRIDGE_LOGO_URL: '${BRIDGE_LOGO_URL:-}',
  BRIDGE_FAVICON_URL: '${BRIDGE_FAVICON_URL:-}',
  BRIDGE_PRIMARY_COLOR: '${BRIDGE_PRIMARY_COLOR:-}',
  BRIDGE_SUPPORT_EMAIL: '${BRIDGE_SUPPORT_EMAIL:-}',
  BRIDGE_DOCS_URL: '${BRIDGE_DOCS_URL:-}',
  WC_PROJECT_ID: '${WC_PROJECT_ID:-}',
  BRIDGE_WALLET_DEFAULT_CHAIN: '${BRIDGE_WALLET_DEFAULT_CHAIN:-}',
  BRIDGE_WALLET_SUPPORTED_CHAINS: '${BRIDGE_WALLET_SUPPORTED_CHAINS:-}',
  BRIDGE_MPC_PUBLIC_URL: '${BRIDGE_MPC_PUBLIC_URL:-}',
  BRIDGE_MPC_PRIVATE_URL: '${BRIDGE_MPC_PRIVATE_URL:-}',
  BRIDGE_MPC_PROTOCOL: '${BRIDGE_MPC_PROTOCOL:-}',
}
EOF
