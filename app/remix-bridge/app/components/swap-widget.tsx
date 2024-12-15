import React, { useRef } from 'react'

// import DecimalInput from './decimal-input'
import NetworkCombobox from './network-combobox'

import type { Network } from '@/domain/types'

const SwapView: React.FC<{
  className?: string
  fromNetworks: Network[]
  fromInitial?: Network
  toNetworks: Network[]
  toInitial?: Network
}> = ({
  className='',
  fromNetworks,
  fromInitial,
  toNetworks,
  toInitial,
}) => {

  const vRef = useRef<string>('')
  const fromRef = useRef<Network | undefined>(fromInitial)
  const toRef = useRef<Network | undefined>(toInitial)

  const setValue = (v: string) => {
    console.log("SwapView setValue :", v)
    vRef.current = v
  }

  const setFromNetwork = (n: Network) => {
    console.log("SwapView setFromNetwork :", n.display_name)
    fromRef.current = n
  }

  const setToNetwork = (n: Network) => {
    console.log("SwapView settoNetwork :", n.display_name)
    toRef.current = n
  }

  return (
    <div className={className}>
      <div className='flex w-full gap-2'>
        <NetworkCombobox
          networks={fromNetworks}
          setNetwork={setFromNetwork}
          network={fromRef.current}
          buttonClx='grow'
          popoverClx='w-[350px]'
          popoverAlign='start'
        />
        <NetworkCombobox
          networks={toNetworks}
          setNetwork={setToNetwork}
          network={toRef.current}
          buttonClx='grow'
          popoverClx='w-[350px]'
          popoverAlign='end'
        />
      </div>
    </div>
  )
}

export default SwapView