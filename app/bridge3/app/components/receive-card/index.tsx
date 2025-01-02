import React, { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { AnimatePresence } from 'motion/react'
import * as motion from 'motion/react-client'

import { cn } from '@hanzo/ui/util'

import type { Bridge, } from '@/domain/types'
import { useSwapState } from '@/contexts/swap-state'

import BridgeLabel from './bridge-label'

const formatToMaxChar = (
  n: number, 
  charsAllowed: number,   // this should be at least 1 + ellipses.lenght + lastChars
  lastChars: number,
  ellipses='...'
): string | null => {
  const result = n.toString()
  if (result.length > charsAllowed) {
    const end = result.slice(-lastChars)
    //const toRemove = result.length - charsAllowed + ellipses.length
    const start = result.slice(0, charsAllowed - lastChars - ellipses.length)
    return start + ellipses + end
  }
  return null
}

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
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
    }, 400)
  }, [amount])

  return (
    <AnimatePresence initial={visible} mode='wait'>
    { loading ? (
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        exit={{ opacity: 0, scaleY: 0 }}
        className={cn(
          //'flex flex-col gap-3',
          //'border border-muted-4 py-2 px-2', 
          className
        )} 
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
        <div className='flex justify-start items-end text-xl font-bold'>
          <span className='block leading-none'>{formatToMaxChar(amount, 15, 3) ?? amount}</span>&nbsp;
          {swapState.toAsset && (<span className='block text-base leading-none pb-[1px]'>{swapState.toAsset?.asset ?? ''}</span>) }
        </div>
      </motion.div> 
    ) : null)}
    </AnimatePresence>
  )

})

export default ReceiveCard
