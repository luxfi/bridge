import React from 'react'

import { Combobox, type SelectElement } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

import type { Network } from '@/domain/types'

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
  placeholder='',
  searchHint='',
  disabled=false,
  buttonClx='',
  popoverClx='',
}) => {

  const handleSelect = (n: SelectElement) => {
    setNetwork(n as unknown as Network)
  }


  return (
    <Combobox
      elements={networks.map((n: Network) => ({
        value: n.internal_name,
        label: n.display_name,
        imageUrl: n.logo
      } satisfies SelectElement))}
      initial={!network ? undefined : {
        value: network.internal_name,
        label: network.display_name,
        imageUrl: network.logo
      } satisfies SelectElement}
      elementSelected={handleSelect}
      buttonClx={cn('font-sans font-medium w-full pl-1.5', buttonClx)}
      popoverClx={cn('font-sans font-medium w-full', popoverClx)}
      disabled={disabled}
    />
  )
}

export default NetworkCombobox
