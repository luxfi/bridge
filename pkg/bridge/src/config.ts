// Runtime config plumbing for the @luxfi/bridge SDK.
//
// The SDK is declarative: a host passes a `BridgeConfig` once at mount time
// and the bridge UI consumes it via this module's getters. There is no
// hostname-based detection here — that lives in downstream consumer apps.

import type { BrandConfig, BridgeConfig } from './types'

let current: BridgeConfig | undefined

/**
 * Set the active bridge config. Called by `mountBridge` during boot.
 * Idempotent: calling again overwrites the previous config.
 */
export function setConfig(cfg: BridgeConfig): BridgeConfig {
  // Precedence: new auth.{clientId,orgSlug} blocks win over legacy
  // top-level fields. Conflict throws so tenants notice at boot.
  if (cfg.clientId && cfg.auth?.clientId && cfg.clientId !== cfg.auth.clientId) {
    throw new Error('@luxfi/bridge: conflicting clientId (top-level vs auth.clientId)')
  }
  if (cfg.iamOrg && cfg.auth?.orgSlug && cfg.iamOrg !== cfg.auth.orgSlug) {
    throw new Error('@luxfi/bridge: conflicting org (iamOrg vs auth.orgSlug)')
  }
  current = cfg
  return cfg
}

/**
 * Read the active bridge config. Throws if `mountBridge` has not been called.
 *
 * Internal modules call this lazily so the config cache is populated by the
 * time the React tree renders.
 */
export function getConfig(): BridgeConfig {
  if (!current) {
    throw new Error('@luxfi/bridge: getConfig() called before mountBridge()')
  }
  return current
}

/**
 * Upsert a `<meta>` tag's `content`, matched by an attribute selector, creating
 * it in `<head>` if absent. `attr`/`val` identify the tag (`name="description"`
 * or `property="og:description"`); `content` is the white-labeled text.
 */
function setMeta(attr: 'name' | 'property', val: string, content: string): void {
  let el = document.head?.querySelector<HTMLMetaElement>(`meta[${attr}="${val}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, val)
    document.head?.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * Apply brand metadata to the host document (title, description, favicon, CSS
 * variables).
 *
 * Pure side effect on `document`. Called once by `mountBridge`.
 */
export function applyBrandMetadata(brand: BrandConfig | undefined): void {
  if (!brand || typeof document === 'undefined') return

  if (brand.name) {
    document.title = brand.name
  }

  // White-label the description across the standard + social meta so no non-Lux
  // surface leaks a foreign brand in its <head>. index.html ships the Lux
  // default; this rewrites it per tenant at mount.
  if (brand.description) {
    setMeta('name', 'description', brand.description)
    setMeta('property', 'og:description', brand.description)
    setMeta('name', 'twitter:description', brand.description)
  }

  if (brand.faviconUrl) {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (link) link.href = brand.faviconUrl
  }

  const root = document.documentElement
  if (brand.primaryColor) root.style.setProperty('--brand-primary', brand.primaryColor)
  if (brand.secondaryColor) root.style.setProperty('--brand-secondary', brand.secondaryColor)
}

export type { BrandConfig, BridgeConfig }
