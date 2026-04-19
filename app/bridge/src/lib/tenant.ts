/**
 * Tenant resolution via Hanzo IAM organization.
 *
 * The IAM org IS the tenant. Each deployment sets VITE_IAM_HOST + VITE_IAM_ORG
 * env vars at build time. The bridge fetches org config (name, logo, colors)
 * from IAM at runtime. Login is standard OIDC via IAM. JWT org claim drives
 * everything downstream.
 *
 * Same pattern as ~/work/lux/exchange and ~/work/liquidity/app/apps/cex.
 * Zero hardcoded brand. Zero tenant registry. IAM is the single source of truth.
 */

// ── IAM org config (fetched at runtime from Hanzo IAM) ──────────────

export interface IamOrg {
  name: string
  displayName: string
  websiteUrl: string
  logo: string
  logoDark: string
  favicon: string
  themeData?: {
    themeType?: string
    colorPrimary?: string
    borderRadius?: number
    isCompact?: boolean
    isEnabled?: boolean
  }
}

// ── Tenant config (derived from IAM org + bridge-specific env vars) ──

export type MpcMode = 'lux-mpc' | 't-chain' | 'custom'

export interface TenantConfig {
  /** Org name from IAM (e.g. "liquidity", "hanzo", "pars") */
  orgName: string
  /** Display name from IAM org.displayName */
  name: string
  /** Logo URL from IAM org.logo */
  logoUrl: string
  /** Logo for dark mode from IAM org.logoDark */
  logoDarkUrl: string
  /** Favicon from IAM org.favicon */
  faviconUrl: string
  /** Primary brand color from IAM org.themeData.colorPrimary */
  primaryColor: string
  /** Website URL from IAM org.websiteUrl */
  websiteUrl: string
  /** MPC mode — from VITE_BRIDGE_MPC_MODE env (default: custom) */
  mpcMode: MpcMode
  /** MPC endpoint — from VITE_MPC_ENDPOINT env */
  mpcEndpoint: string
  /** Network — from VITE_BRIDGE_NETWORK env (default: mainnet) */
  network: 'mainnet' | 'testnet'
  /** Allowed chains — from VITE_BRIDGE_ALLOWED_CHAINS env (comma-sep, or empty = all) */
  allowedChains?: string[]
  /** IAM OIDC issuer URL */
  iamHost: string
  /** IAM OIDC client ID */
  clientId: string
  /** Explorer URL — from VITE_BRIDGE_EXPLORER_URL env */
  explorerUrl: string
  /** Docs URL — from VITE_BRIDGE_DOCS_URL env */
  docsUrl: string
}

// ── Environment config (Vite-style, with safe fallback to globalThis.process) ──

// Vite exposes env vars under import.meta.env. Some deps still reach for
// process.env at module-init; vite.config.ts defines `process.env` as `{}`
// so we can safely reference globalThis.process.env with ?? fallbacks.
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {}

function e(...keys: string[]): string {
  for (const k of keys) {
    const v = env[k]
    if (v) return v
  }
  return ''
}

const IAM_HOST = e('VITE_IAM_HOST', 'VITE_NEXT_PUBLIC_IAM_HOST')
const IAM_ORG = e('VITE_IAM_ORG', 'VITE_NEXT_PUBLIC_IAM_ORG')
const CLIENT_ID = e('VITE_IAM_CLIENT_ID', 'VITE_NEXT_PUBLIC_CLIENT_ID')
const MPC_ENDPOINT = e('VITE_MPC_ENDPOINT')
const MPC_MODE = (e('VITE_BRIDGE_MPC_MODE') || 'custom') as MpcMode
const NETWORK = (e('VITE_BRIDGE_NETWORK') || 'mainnet') as 'mainnet' | 'testnet'
const ALLOWED_CHAINS_RAW = e('VITE_BRIDGE_ALLOWED_CHAINS')
const ALLOWED_CHAINS = ALLOWED_CHAINS_RAW
  ? ALLOWED_CHAINS_RAW.split(',').map((s) => s.trim()).filter(Boolean)
  : undefined
const EXPLORER_URL = e('VITE_BRIDGE_EXPLORER_URL')
const DOCS_URL = e('VITE_BRIDGE_DOCS_URL')
const BRAND_NAME = e('VITE_BRAND_NAME', 'VITE_NEXT_PUBLIC_BRAND_NAME') || 'Bridge'

// ── Fallback (used when IAM is unreachable) ──────────────────────────

const FALLBACK_TENANT: TenantConfig = {
  orgName: IAM_ORG || 'bridge',
  name: BRAND_NAME,
  logoUrl: '/assets/img/logo.svg',
  logoDarkUrl: '/assets/img/logo-dark.svg',
  faviconUrl: '/favicon.ico',
  primaryColor: '#4f46e5',
  websiteUrl: '',
  mpcMode: MPC_MODE,
  mpcEndpoint: MPC_ENDPOINT,
  network: NETWORK,
  allowedChains: ALLOWED_CHAINS,
  iamHost: IAM_HOST,
  clientId: CLIENT_ID,
  explorerUrl: EXPLORER_URL,
  docsUrl: DOCS_URL,
}

// ── Fetch org from IAM ───────────────────────────────────────────────

let cachedTenant: TenantConfig | null = null
let cacheExpiry = 0

/**
 * Fetch org config from Hanzo IAM and build TenantConfig.
 * Caches for 5 minutes. Falls back to env-var defaults if IAM unreachable.
 */
export async function fetchTenant(): Promise<TenantConfig> {
  const now = Date.now()
  if (cachedTenant && now < cacheExpiry) return cachedTenant

  if (!IAM_HOST || !IAM_ORG) {
    cachedTenant = FALLBACK_TENANT
    cacheExpiry = now + 300_000
    return cachedTenant
  }

  try {
    const url = `${IAM_HOST.replace(/\/+$/, '')}/api/get-organization?id=admin/${IAM_ORG}`
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error(`IAM returned ${res.status}`)

    const body = await res.json()
    const org: IamOrg = body.data ?? body

    cachedTenant = {
      orgName: org.name || IAM_ORG,
      name: org.displayName || FALLBACK_TENANT.name,
      logoUrl: org.logo || FALLBACK_TENANT.logoUrl,
      logoDarkUrl: org.logoDark || org.logo || FALLBACK_TENANT.logoDarkUrl,
      faviconUrl: org.favicon || FALLBACK_TENANT.faviconUrl,
      primaryColor: org.themeData?.colorPrimary || FALLBACK_TENANT.primaryColor,
      websiteUrl: org.websiteUrl || FALLBACK_TENANT.websiteUrl,
      mpcMode: MPC_MODE,
      mpcEndpoint: MPC_ENDPOINT,
      network: NETWORK,
      allowedChains: ALLOWED_CHAINS,
      iamHost: IAM_HOST,
      clientId: CLIENT_ID,
      explorerUrl: EXPLORER_URL,
      docsUrl: DOCS_URL,
    }
    cacheExpiry = now + 300_000
    return cachedTenant
  } catch (err) {
    console.error('[tenant] Failed to fetch org from IAM, using fallback:', err)
    cachedTenant = FALLBACK_TENANT
    cacheExpiry = now + 60_000
    return cachedTenant
  }
}

/**
 * Synchronous access to cached tenant (for client components).
 * Returns fallback if not yet fetched.
 */
export function getTenant(): TenantConfig {
  return cachedTenant || FALLBACK_TENANT
}

/**
 * MPC endpoint for this deployment.
 */
export function getMpcEndpoint(): string {
  const t = getTenant()
  return t.mpcEndpoint || MPC_ENDPOINT || 'http://mpc-node-0:6000'
}
