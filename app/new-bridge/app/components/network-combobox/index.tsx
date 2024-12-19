import React from 'react'

import { Combobox } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Network } from '@/domain/types'

import adaptor from './adaptor'
import NetworkComboboxTrigger, { type NetworkTriggerProps } from './trigger'

const ICON_SIZE = 40

const NetworkCombobox: React.FC<{
  networks: Network[]
  network: Network | null
  setNetwork: (network: Network | null) => void
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
    current={network}
    setCurrent={setNetwork}
    adaptor={adaptor}
    searchPlaceholder={searchHint}
    noCheckmark
    popoverClx={cn('font-sans font-medium w-full', popoverClx)}
    popoverAlign={popoverAlign}
    listItemClx='bg-background hover:!bg-level-3'
    listItemSelectedClx='!bg-level-2'
    Trigger={NetworkComboboxTrigger}
    triggerProps={{
      open: false,
      current: (network ?? null),
      currentLabel: null,
      imageUrl: null,
      buttonClx: cn('font-sans font-medium w-full px-2', buttonClx),
      disabled: false,
      imageSize: ICON_SIZE,
      label,
      rightJustified  
    }}
  />
)

export default NetworkCombobox
