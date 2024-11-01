import { footer, mainNav, type SiteDef  } from '@luxfi/ui/site-def'

export default {
  currentAs: 'https://bridge.lux.network',
  nav: {
    common: mainNav,
  },
  footer: footer.standard, 
  noAuth: true
} satisfies SiteDef
