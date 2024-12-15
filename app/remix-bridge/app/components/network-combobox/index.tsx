import React from 'react'

import { Combobox } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Network } from '@/domain/types'

import adaptor from './adaptor'
import NetworkComboboxTrigger, { type NetworkTriggerProps } from './trigger'

const ICON_SIZE = 32

const NetworkCombobox: React.FC<{
  networks: Network[]
  network?: Network
  setNetwork: (network: Network) => void
  searchHint?: string
  popoverClx?: string
  buttonClx?: string
  popoverAlign? : "center" | "end" | "start"
  label: string
  rightJustified?: boolean
}> = ({
  networks, 
  network, 
  setNetwork,
  searchHint,
  popoverClx='',
  popoverAlign = 'center', 
  buttonClx='',
  label,
  rightJustified=false
}) => (

  <Combobox<Network, NetworkTriggerProps>
    elements={networks}
    adaptor={adaptor}
    initial={network}
    elementSelected={setNetwork}
    searchPlaceholder={searchHint}
    popoverClx={cn('font-sans font-medium w-full', popoverClx)}
    popoverAlign={popoverAlign}
    Trigger={NetworkComboboxTrigger}
    triggerProps={{
      open: false,
      current: (network ?? null),
      currentLabel: null,
      imageUrl: null,
      buttonClx: cn('font-sans font-medium w-full pl-1.5 pr-2', buttonClx),
      disabled: false,
      imageSize: ICON_SIZE,
      label,
      rightJustified  
    }}
  />
)

export default NetworkCombobox
