/**
 * White-label multi-tenant bridge configuration.
 *
 * Tenant config is resolved by hostname at request time.
 * MPC backend is pluggable: "lux-mpc" (3-node cluster) or "t-chain" (ThresholdVM).
 * Anyone can self-host by pointing a domain at the bridge and providing config.
 */

export type MpcMode = 'lux-mpc' | 't-chain' | 'custom'

export interface TenantConfig {
  /** Display name shown in UI */
  name: string
  /** Logo image URL */
  logoUrl: string
  /** Favicon URL */
  faviconUrl?: string
  /** Brand primary color (hex) */
  primaryColor: string
  /** Brand secondary/accent color (hex) */
  accentColor?: string
  /** Which MPC backend to use */
  mpcMode: MpcMode
  /** Override MPC endpoint (for "custom" mode or self-hosted) */
  mpcEndpoint?: string
  /** Network environment */
  network: 'mainnet' | 'testnet'
  /** Allowed source/destination chain IDs (undefined = all) */
  allowedChains?: string[]
  /** API server URL override */
  apiUrl?: string
  /** External links */
  links?: {
    home?: string
    explorer?: string
    docs?: string
  }
}

export interface ResolvedTenant extends TenantConfig {
  hostname: string
}

// Default tenant (lux bridge)
export const DEFAULT_TENANT: TenantConfig = {
  name: 'Lux Bridge',
  logoUrl: 'https://lux.network/images/logo.png',
  primaryColor: '#0055ff',
  accentColor: '#00ccff',
  mpcMode: 'lux-mpc',
  network: 'mainnet',
  links: {
    home: 'https://lux.network',
    explorer: 'https://explore.lux.network',
    docs: 'https://docs.lux.network',
  },
}

// Static tenant registry — add hostname → config.
// For self-hosted deployments: set BRIDGE_TENANT_CONFIG env var with JSON.
export const TENANT_REGISTRY: Record<string, TenantConfig> = {
  'bridge.lux.network': {
    name: 'Lux Bridge',
    logoUrl: 'https://lux.network/images/logo.png',
    faviconUrl: 'https://lux.network/favicon.ico',
    primaryColor: '#0055ff',
    accentColor: '#00ccff',
    mpcMode: 'lux-mpc',
    network: 'mainnet',
    links: {
      home: 'https://lux.network',
      explorer: 'https://explore.lux.network',
      docs: 'https://docs.lux.network',
    },
  },
  'bridge-test.lux.network': {
    name: 'Lux Bridge (Testnet)',
    logoUrl: 'https://lux.network/images/logo.png',
    primaryColor: '#0055ff',
    accentColor: '#00ccff',
    mpcMode: 'lux-mpc',
    network: 'testnet',
    links: {
      home: 'https://lux.network',
      explorer: 'https://explore.lux-test.network',
    },
  },
  'bridge.pars.network': {
    name: 'Pars Bridge',
    logoUrl: 'https://pars.network/logo.svg',
    faviconUrl: 'https://pars.network/favicon.ico',
    primaryColor: '#00cc88',
    accentColor: '#00ffaa',
    mpcMode: 'lux-mpc',
    network: 'mainnet',
    allowedChains: ['PARS', 'LUX', 'ETHEREUM', 'BSC'],
    links: {
      home: 'https://pars.network',
      explorer: 'https://explore.pars.network',
    },
  },
  'bridge.hanzo.ai': {
    name: 'Hanzo Bridge',
    logoUrl: 'https://hanzo.ai/logo.svg',
    faviconUrl: 'https://hanzo.ai/favicon.ico',
    primaryColor: '#fd4444',
    accentColor: '#ff6666',
    mpcMode: 'lux-mpc',
    network: 'mainnet',
    links: {
      home: 'https://hanzo.ai',
      explorer: 'https://explore.hanzo.ai',
      docs: 'https://docs.hanzo.ai',
    },
  },
  'bridge.zoo.ngo': {
    name: 'Zoo Bridge',
    logoUrl: 'https://zoo.ngo/logo.svg',
    faviconUrl: 'https://zoo.ngo/favicon.ico',
    primaryColor: '#22c55e',
    accentColor: '#4ade80',
    mpcMode: 'lux-mpc',
    network: 'mainnet',
    links: {
      home: 'https://zoo.ngo',
      explorer: 'https://explore.zoo.ngo',
    },
  },
}

/**
 * Resolve tenant config from hostname.
 * Falls back to env-configured tenants, then DEFAULT_TENANT.
 */
export function resolveTenant(hostname: string): ResolvedTenant {
  // Strip port if present (e.g. localhost:3000)
  const host = hostname.split(':')[0]

  // 1. Check static registry
  const config = TENANT_REGISTRY[host]
  if (config) {
    return { ...config, hostname: host }
  }

  // 2. Check env var override (for self-hosted deployments)
  const envConfig = process.env.BRIDGE_TENANT_CONFIG
  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig) as Record<string, TenantConfig>
      if (parsed[host]) {
        return { ...parsed[host], hostname: host }
      }
    } catch {
      // ignore
    }
  }

  // 3. Default
  return { ...DEFAULT_TENANT, hostname: host }
}

/**
 * MPC endpoint resolution.
 * lux-mpc → cluster endpoint (set via env or default)
 * t-chain → ThresholdVM RPC on T-chain
 * custom → tenant-specified endpoint
 */
export function getMpcEndpoint(tenant: TenantConfig): string {
  if (tenant.mpcEndpoint) return tenant.mpcEndpoint

  switch (tenant.mpcMode) {
    case 't-chain':
      return (
        process.env.TCHAIN_MPC_ENDPOINT || 'https://api.lux.network/ext/bc/T'
      )
    case 'lux-mpc':
    default:
      return process.env.MPC_ENDPOINT || 'http://mpc-node-0:6000'
  }
}
