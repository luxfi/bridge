import { footer, mainNav, type SiteDef  } from '@luxfi/ui/site-def'

export default {
  currentAs: process.env.NEXT_PUBLIC_SITE_URL || '',
  nav: {
    common: mainNav,
  },
  footer: footer.standard,
  noAuth: true
} satisfies SiteDef
