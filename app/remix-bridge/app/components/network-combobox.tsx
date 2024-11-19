import React from 'react'

import { Combobox, type ListAdaptor } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Network } from '@/domain/types'

const adaptor = {
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

const NetworkCombobox: React.FC<{
  networks: Network[]
  network?: Network
  setNetwork: (network: Network) => void
  placeholder?: string
  searchHint?: string
  disabled?: boolean
  buttonClx?: string 
  popoverClx?: string
}> = ({
  networks, 
  network, 
  setNetwork,
  placeholder,
  searchHint,
  disabled=false,
  buttonClx='',
  popoverClx='',
}) => (

  <Combobox<Network>
    elements={networks}
    adaptor={adaptor}
    initial={network}
    elementSelected={setNetwork}
    buttonPlaceholder={placeholder}
    searchPlaceholder={searchHint}
    buttonClx={cn('font-sans font-medium w-full pl-1.5 pr-2', buttonClx)}
    popoverClx={cn('font-sans font-medium w-full', popoverClx)}
    disabled={disabled}
  />
)

export default NetworkCombobox
