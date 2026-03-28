/**
 * Tenant resolution via Hanzo IAM organization.
 *
 * The IAM org IS the tenant. Each deployment sets IAM_HOST + IAM_ORG env vars.
 * The bridge fetches org config (name, logo, colors) from IAM at startup.
 * Login is standard OIDC via IAM. JWT org claim drives everything downstream.
 *
 * This is the same pattern used by:
 *   - ~/work/lux/exchange (VITE_IAM_HOST + VITE_IAM_ORG)
 *   - ~/work/hanzo/kms (SITE_NAME from IAM org)
 *   - ~/work/liquidity/app/apps/cex (VITE_IAM_HOST + VITE_IAM_ORG)
 *
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
  /** MPC mode — from BRIDGE_MPC_MODE env (default: custom) */
  mpcMode: MpcMode
  /** MPC endpoint — from MPC_ENDPOINT env */
  mpcEndpoint: string
  /** Network — from BRIDGE_NETWORK env (default: mainnet) */
  network: 'mainnet' | 'testnet'
  /** Allowed chains — from BRIDGE_ALLOWED_CHAINS env (comma-sep, or empty = all) */
  allowedChains?: string[]
  /** IAM OIDC issuer URL */
  iamHost: string
  /** IAM OIDC client ID */
  clientId: string
  /** Explorer URL — from BRIDGE_EXPLORER_URL env */
  explorerUrl: string
  /** Docs URL — from BRIDGE_DOCS_URL env */
  docsUrl: string
}

// ── Environment config ───────────────────────────────────────────────

const IAM_HOST = process.env.NEXT_PUBLIC_IAM_HOST || process.env.IAM_HOST || ''
const IAM_ORG = process.env.NEXT_PUBLIC_IAM_ORG || process.env.IAM_ORG || ''
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID || process.env.IAM_CLIENT_ID || ''
const MPC_ENDPOINT = process.env.MPC_ENDPOINT || ''
const MPC_MODE = (process.env.BRIDGE_MPC_MODE || 'custom') as MpcMode
const NETWORK = (process.env.BRIDGE_NETWORK || 'mainnet') as 'mainnet' | 'testnet'
const ALLOWED_CHAINS = process.env.BRIDGE_ALLOWED_CHAINS
  ? process.env.BRIDGE_ALLOWED_CHAINS.split(',').map((s) => s.trim())
  : undefined
const EXPLORER_URL = process.env.BRIDGE_EXPLORER_URL || ''
const DOCS_URL = process.env.BRIDGE_DOCS_URL || ''

// ── Fallback (used when IAM is unreachable) ──────────────────────────

const FALLBACK_TENANT: TenantConfig = {
  orgName: IAM_ORG || 'bridge',
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Bridge',
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
    // No IAM configured — use fallback (env-var driven brand)
    cachedTenant = FALLBACK_TENANT
    cacheExpiry = now + 300_000
    return cachedTenant
  }

  try {
    const url = `${IAM_HOST.replace(/\/+$/, '')}/api/get-organization?id=admin/${IAM_ORG}`
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 300 }, // ISR: revalidate every 5 min
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
    cacheExpiry = now + 60_000 // retry sooner on failure
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
