/**
 * White-label multi-tenant bridge configuration.
 *
 * Tenants point a CNAME at bridge.lux.network — the bridge reads the
 * incoming hostname and serves the right branding, logo, MPC wallet, and
 * chain config automatically. Zero code changes needed for new tenants.
 *
 * Resolution order:
 *   1. Static TENANT_REGISTRY (built-in tenants: lux, pars, hanzo, zoo)
 *   2. BRIDGE_TENANT_CONFIG env var (JSON map) — for self-hosted / Bootnode deployments
 *   3. Default (Lux branding)
 *
 * MPC modes:
 *   lux-mpc   — shared 3-of-5 cluster (no per-tenant SPOF, recommended)
 *   t-chain   — ThresholdVM on T-chain (decentralized, when deployed)
 *   custom    — tenant's own MPC endpoint (self-hosted, set mpcEndpoint)
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
  /** Which MPC backend to use (default: lux-mpc = shared 3-of-5 cluster) */
  mpcMode: MpcMode
  /** Override MPC endpoint — required when mpcMode is "custom" */
  mpcEndpoint?: string
  /** Override bridge API server URL (default: bridge-api.lux.network) */
  apiUrl?: string
  /** Network environment */
  network: 'mainnet' | 'testnet'
  /** Allowed source/destination chain IDs — undefined means all chains */
  allowedChains?: string[]
  /** External links shown in nav/footer */
  links?: {
    home?: string
    explorer?: string
    docs?: string
  }
}

export interface ResolvedTenant extends TenantConfig {
  hostname: string
}

// MPC cluster config (3-of-5 threshold)
export const MPC_CLUSTER = {
  threshold: 3,
  totalNodes: 5,
  scheme: '3-of-5',
}

// Default tenant (Lux branding) — used when hostname is unrecognized
export const DEFAULT_TENANT: TenantConfig = {
  name: 'Lux Bridge',
  logoUrl: '/assets/img/lux-logo.svg',
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

// Static tenant registry — hostname → config.
// New tenants: CNAME yourdomain → bridge.lux.network, add entry here
// OR set BRIDGE_TENANT_CONFIG env var (Bootnode / self-hosted deployments).
export const TENANT_REGISTRY: Record<string, TenantConfig> = {
  'bridge.lux.network': {
    name: 'Lux Bridge',
    logoUrl: '/assets/img/lux-logo.svg',
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
    logoUrl: '/assets/img/lux-logo.svg',
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
 *
 * Works with any CNAME pointing at bridge.lux.network — no DNS config
 * needed on the bridge side beyond adding the host to TENANT_REGISTRY
 * or BRIDGE_TENANT_CONFIG. The ingress TLS cert is handled by cert-manager.
 */
export function resolveTenant(hostname: string): ResolvedTenant {
  // Strip port (localhost:3000 → localhost)
  const host = hostname.split(':')[0]

  // 1. Static registry (built-in tenants)
  const config = TENANT_REGISTRY[host]
  if (config) {
    return { ...config, hostname: host }
  }

  // 2. Env var — JSON map of hostname → TenantConfig
  //    Used by Bootnode / self-hosted deployments to inject tenant config
  //    without rebuilding the image. Set via k8s secret or CI env.
  const envConfig = process.env.BRIDGE_TENANT_CONFIG
  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig) as Record<string, TenantConfig>
      if (parsed[host]) {
        return { ...parsed[host], hostname: host }
      }
      // Wildcard match: *.yourdomain.com
      for (const [pattern, cfg] of Object.entries(parsed)) {
        if (pattern.startsWith('*.')) {
          const suffix = pattern.slice(1) // .yourdomain.com
          if (host.endsWith(suffix)) {
            return { ...cfg, hostname: host }
          }
        }
      }
    } catch {
      // ignore malformed env
    }
  }

  // 3. Default: Lux branding
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
