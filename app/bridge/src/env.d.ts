/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRIDGE_API_HOST?: string
  readonly VITE_BRIDGE_ENV?: string
  readonly VITE_BRIDGE_CLIENT_ID?: string
  readonly VITE_BRIDGE_IAM_ORG?: string
  readonly VITE_BRIDGE_LOGO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
