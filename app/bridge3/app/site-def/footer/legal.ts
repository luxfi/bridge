import type { LinkDef } from '@hanzo/ui/types'

/**
 * Legal links — use env vars for white-label deployments.
 * Default to lps.lux.network for regulatory (shared across all brands).
 */
const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL ?? '/terms'
const privacyUrl = process.env.NEXT_PUBLIC_PRIVACY_URL ?? '/privacy'
const regulatoryUrl = process.env.NEXT_PUBLIC_REGULATORY_URL ?? 'https://lps.lux.network/legal/regulatory-status'

const legal: LinkDef[] = [
  {
    title: 'Terms of Service',
    href: termsUrl,
    newTab: termsUrl.startsWith('http'),
  },
  {
    title: 'Privacy Policy',
    href: privacyUrl,
    newTab: privacyUrl.startsWith('http'),
  },
  {
    title: 'Regulatory Status',
    href: regulatoryUrl,
    newTab: true,
  },
] 

const title: LinkDef = 
{
  title: 'Legal',
  href: '',
  variant: 'linkFG',
}

const legalColumn: LinkDef[] =  [title, ...legal]

export {
  legal,
  legalColumn
}
