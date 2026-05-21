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
  BRIDGE_LOGO_URL: '${BRIDGE_LOGO_URL:-}',
  WC_PROJECT_ID: '${WC_PROJECT_ID:-}',
}
EOF
