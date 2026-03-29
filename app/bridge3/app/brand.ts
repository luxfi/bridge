export interface Brand {
  name: string
  title: string
  description: string
  shortName: string
  legalEntity: string
  appDomain: string
  twitter: string
  github: string
  discord: string
  logoUrl: string
  faviconUrl: string
}

const defaults: Brand = {
  name: 'Lux Bridge',
  title: 'Lux Bridge',
  description: 'Cross-chain bridge powered by Lux Network',
  shortName: 'LUX',
  legalEntity: 'Lux Industries Inc.',
  appDomain: 'bridge.lux.network',
  twitter: 'https://x.com/luxfi',
  github: 'https://github.com/luxfi',
  discord: 'https://discord.gg/lux',
  logoUrl: '/favicon.ico',
  faviconUrl: '/favicon.ico',
}

export let brand: Brand = { ...defaults }

export async function loadBrand(): Promise<Brand> {
  try {
    const res = await fetch('/brand.json')
    if (!res.ok) return brand
    const config = await res.json()
    if (config.brand) Object.assign(brand, config.brand)
    const baseName = brand.name.replace(/\s*bridge\s*/i, '').trim()
    if (!brand.shortName && baseName) brand.shortName = baseName.length <= 3 ? baseName.toUpperCase() : baseName
  } catch {}
  return brand
}
