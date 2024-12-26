import { observer } from 'mobx-react-lite'

import { cn } from '@hanzo/ui/util'


import type { Bridge, } from '@/domain/types'
import { useSwapState } from '@/contexts/swap-state'

import BridgeLabel from './bridge-label'

const ReceiveCard: React.FC<{
  usdValue: number 
  usdFee: number
  assetGas: number
  txnTime: string // eg, '~5min'
  bridges?: Bridge[]  
  bridge?: Bridge
  onSelect?: (bridge: Bridge) => void
  className?: string
}> = observer(({
  usdValue,
  usdFee,
  assetGas,
  txnTime, // eg, '~5min'
  bridge,
  onSelect,
  className=''
}) => {

  const swapState = useSwapState()

  return swapState.amount > 0 ? (
    <div 
      className={cn(
        'border border-muted-4 py-2 px-2', 
        (!!bridge && !!onSelect) ? 'cursor-poiner' : '',
        className
      )} 
      onClick={(!!bridge && !!onSelect) ? () => {onSelect(bridge)} : undefined}
    >
      <div className='flex flex-col justify-between items-center text-sm'>
      {swapState.to ? (
        <span className='block'>Receive on {swapState.to.display_name }</span>
      ) : ( 
        <span className='block'/>
      )}
      {bridge ? (
        <BridgeLabel bridge={bridge} />
      ) : (
        <div />
      )}
      </div>
    </div>
  ) : null
})

export default ReceiveCard
