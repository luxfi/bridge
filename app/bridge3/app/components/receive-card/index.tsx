import { observer } from 'mobx-react-lite'
import { AnimatePresence } from 'motion/react'
import * as motion from 'motion/react-client'

import { cn } from '@hanzo/ui/util'


import type { Bridge, } from '@/domain/types'
import { useSwapState } from '@/contexts/swap-state'

import CurrencyInput from '../currency-input'
import BridgeLabel from './bridge-label'

const ReceiveCard: React.FC<{
  amount: number | null // debounced
  usdFee: number
  assetGas: number
  txnTime: string // eg, '~5min'
  bridge?: Bridge
  className?: string
}> = observer(({
  amount, 
  usdFee,
  assetGas,
  txnTime, // eg, '~5min'
  bridge,
  className=''
}) => {

  const swapState = useSwapState()
  const visible = !!amount // Note: both and null or === 0

  return (
    <AnimatePresence initial={visible}>
    {visible ? (
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        exit={{ opacity: 0, scaleY: 0 }}
        className={cn(
          'flex flex-col gap-3',
          'border border-muted-4 py-2 px-2', 
          !!bridge ? 'cursor-poiner' : '',
          className
        )} 
      >
        <div className='flex justify-between items-center text-sm'>
        {swapState.toNetwork ? (
          <span className='block font-bold'>Get on {swapState.toNetwork!.display_name }</span>
        ) : ( 
          <span className='block'/>
        )}
        {bridge ? (
          <BridgeLabel bridge={bridge!} />
        ) : (
          <div />
        )}
        </div>
        <div className='flex justify-start text-3xl font-bold items-center'>
          <CurrencyInput 
            readOnly
            //decimalScale={2}
            value={swapState.fromAssetQuantity} // TODO
            className='cursor-default !border-none bg-level-0 !min-w-0 shrink focus:outline-none'
          /> 
          {swapState.toAsset && (<span className='block'>{swapState.toAsset?.asset ?? ''}</span>) }
        </div>

      </motion.div> 
    ) : null}
    </AnimatePresence>
  )

})

export default ReceiveCard
