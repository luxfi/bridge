import React, { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { AnimatePresence } from 'motion/react'
import * as motion from 'motion/react-client'

import { cn, formatToMaxChar } from '@hanzo/ui/util'

import { useSwapState } from '@/contexts/swap-state'

import BridgeLabel from './bridge-label'

const ReceiveCard: React.FC<{
  quantity: number | null // debounced
  usdFee: number
  assetGas: number
  txnTime: string // eg, '~5min'
  className?: string
}> = observer(({
  quantity, 
  usdFee,
  assetGas,
  txnTime, // eg, '~5min'
  className=''
}) => {

  const swapState = useSwapState()
  const visible = !!quantity // Note: both and null or === 0

  const [loading, setLoading] = useState<boolean>(false)
  const [quantityDisplay, setQuantityDisplay] = useState<string>('')


  useEffect(() => {
    setLoading(true)

    const {
      result,
      change
    } = formatToMaxChar(quantity, 15) 
    setQuantityDisplay(change === 'rounded' ? '~' + result : result)
      // mimic remote fetch
    setTimeout(() => {
      setLoading(false)
    }, 400)
  }, [quantity])

  return (
    <AnimatePresence initial={visible} mode='wait'>
    { loading && visible ?  (
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        exit={{ opacity: 0, scaleY: 0 }}
        className={className} 
      >
        loading...
      </motion.div>
    ) : ( visible ? (
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        exit={{ opacity: 0, scaleY: 0 }}
        className={cn(
          'flex flex-col gap-3',
          'border border-muted-4 py-2 px-2', 
          className
        )} 
      >
        <div className='flex justify-between items-center text-sm'>
        {swapState.toNetwork ? (
          <span className='block font-bold'>Get on {swapState.toNetwork!.display_name }</span>
        ) : ( 
          <span className='block'/>
        )}
          <BridgeLabel/>
        </div>
        <div className='flex justify-start items-end text-xl font-bold'>
          {quantityDisplay && (<span className='block leading-none'>{quantityDisplay}&nbsp;</span>)}
          {swapState.toAsset && (<span className='block text-base leading-none pb-[1px]'>{swapState.toAsset?.asset ?? ''}</span>) }
        </div>
      </motion.div> 
    ) : null)}
    </AnimatePresence>
  )

})

export default ReceiveCard
