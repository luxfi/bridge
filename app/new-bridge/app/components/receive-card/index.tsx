import React from 'react'

import { cn } from '@hanzo/ui/util'

import type { Bridge, Network, Token } from '@/domain/types'
import BridgeLabel from './bridge-label'

const ReceiveCard: React.FC<{
  from: Network
  to: Network
  token: Token
  usdValue: number 
  usdFee: number
  gasInTokens: number
  txnTime: string // eg, '~5min'
  bridges?: Bridge[]  
  bridge?: Bridge
  onSelect?: (bridge: Bridge) => void
  className?: string
}> = ({
  from,
  to,
  token,
  usdValue,
  usdFee,
  gasInTokens,
  txnTime, // eg, '~5min'
  bridge,
  onSelect,
  className=''
}) => {
  return (
    <div 
      className={cn(
        'border border-muted-4 py-2 px-2', 
        (!!bridge && !!onSelect) ? 'cursor-poiner' : '',
        className
      )} 
      onClick={(!!bridge && !!onSelect) ? () => {onSelect(bridge)} : undefined}
    >
      <div className='flex flex-col justify-between items-center text-sm'>
        <span className='block'>Receive on {to.display_name}</span>
        {bridge ? (
          <BridgeLabel bridge={bridge} />
        ) : (
          null
        )}
      </div>
    </div>
  )
}

export default ReceiveCard
