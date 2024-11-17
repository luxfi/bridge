import React, { useRef } from 'react'

import DecimalInput from './decimal-input'
import NetworkCombobox from './network-combobox'

import { networks  } from '@/domain/settings/teleport/networks.mainnets'
import type { Network } from '@/domain/types'

const SwapView: React.FC<{
  className?: string
}> = ({
  className=''
}) => {

  const vRef = useRef<string>('')
  const networkRef = useRef<Network | undefined>(undefined)

  const setValue = (v: string) => {
    console.log("SwapView setValue :", v)
    vRef.current = v
  }

  const setNetwork = (n: Network) => {
    console.log("SwapView setNetwork :", n.display_name)
    networkRef.current = n
  }

  return (
    <div className={className}>
      <NetworkCombobox
        networks={networks}
        setNetwork={setNetwork}
        network={networkRef.current}
        buttonClx='mb-4 w-[400px]'
        popoverClx='w-[400px]'
      />
      <DecimalInput className='fg-foreground bg-background border border-muted-3 w-full px-1' value={vRef.current} setValue={setValue} />
    </div>
  )
}

export default SwapView