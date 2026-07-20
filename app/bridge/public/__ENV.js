// Runtime env for the bridge SPA. Overwritten at container boot by the
// serving image's docker-entrypoint, or baked at build time.
//
// The SDK's bridge.config.ts reads window.__ENV before falling back to
// Vite's build-time import.meta.env. This decouples the deployable image
// from the environment it runs in: one image, N envs.
window.__ENV = window.__ENV || {
  BRIDGE_API_HOST: '',
  BRIDGE_ENV: '',
  BRIDGE_CLIENT_ID: '',
  BRIDGE_IAM_ORG: '',
  BRIDGE_BRAND_NAME: '',
  BRIDGE_DESCRIPTION: '',
  BRIDGE_LOGO_URL: '',
  BRIDGE_FAVICON_URL: '',
  BRIDGE_PRIMARY_COLOR: '',
  BRIDGE_SUPPORT_EMAIL: '',
  BRIDGE_DOCS_URL: '',
  WC_PROJECT_ID: '',
  BRIDGE_WALLET_DEFAULT_CHAIN: '',
  BRIDGE_WALLET_SUPPORTED_CHAINS: '',
  BRIDGE_MPC_PUBLIC_URL: '',
  BRIDGE_MPC_PRIVATE_URL: '',
  BRIDGE_MPC_PROTOCOL: '',
}
