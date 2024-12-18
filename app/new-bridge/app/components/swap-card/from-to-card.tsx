import { useState } from 'react'

import type { Network } from '@/domain/types'

// import DecimalInput from './decimal-input'
import NetworkCombobox from '../network-combobox'
import ReverseButton from './reverse-button'

const ABS_CENTERED = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%,-50%)'
} satisfies React.CSSProperties

const FromToCard: React.FC<{
  from: Network | null
  to: Network | null
  fromNetworks: Network[] 
  toNetworks: Network[] 
  setFrom: (v: Network | null) => void
  setTo: (v: Network | null) => void
  swapFromAndTo: () => void
  className?: string
}> = ({
  from,
  to,
  fromNetworks,
  toNetworks,
  setFrom,
  setTo,
  swapFromAndTo,
  className=''
}) => {


    // 'flex w-full gap-2 relative'
  return (
    <div className={className}>
      <NetworkCombobox
        networks={fromNetworks}
        setNetwork={setFrom}
        network={from}
        buttonClx='grow pr-4'
        popoverClx='w-[350px]'
        popoverAlign='start'
        label='from'
      />
      <NetworkCombobox
        networks={toNetworks}
        setNetwork={setTo}
        network={to}
        buttonClx='grow pl-4'
        popoverClx='w-[350px]'
        popoverAlign='end'
        label='to'
        rightJustified
      />
      <ReverseButton 
        className='p-1 h-auto text-muted active:!bg-level-3' 
        onClick={swapFromAndTo} 
        style={ABS_CENTERED}
      />
    </div>
  )
}

export default FromToCard
