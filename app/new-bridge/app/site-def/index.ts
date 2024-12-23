import type SiteDef  from '@/types/site-def'
import { standard } from './footer' 
import mainNav from './main-nav'

export default {
  //currentAs: 'https://lux.bridge',
  nav: {
    common: mainNav,
  },
  footer: standard, 
} satisfies SiteDef
