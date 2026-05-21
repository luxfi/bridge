/// <reference types="vite/client" />

// Build-time Vite envs. These are the fallback for the runtime
// window.__ENV mechanism (see src/bridge.config.ts). Vite inlines
// `import.meta.env.VITE_*` at build, so changing one after the
// bundle is built does nothing — that's why we layer window.__ENV
// (templated by the serving image at boot) on top.
interface ImportMetaEnv {
  readonly VITE_BRIDGE_API_HOST?: string
  readonly VITE_BRIDGE_ENV?: string
  readonly VITE_BRIDGE_CLIENT_ID?: string
  readonly VITE_BRIDGE_IAM_ORG?: string
  readonly VITE_BRIDGE_LOGO_URL?: string
  readonly VITE_WC_PROJECT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
