
import { type ListAdaptor } from '@hanzo/ui/primitives-common'
import type { Network } from '@/domain/types'

export default {
  getValue:   (el: Network): string => (el.internal_name),
  equals:     (el1: Network, el2: Network): boolean => (
    el1.internal_name.toUpperCase() === el2.internal_name.toUpperCase()
  ),
  valueEquals: (el: Network, v: string): boolean => (
    el.internal_name.toUpperCase() === v.toUpperCase()
  ),
  getLabel:  (el: Network): string => (el.display_name),
  getImageUrl:  (el: Network): string => (el.logo),

} satisfies ListAdaptor<Network>
