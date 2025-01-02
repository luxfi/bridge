import { useEffect, useRef } from 'react'
import { observable, reaction, type IObservableValue } from 'mobx'
import { observer } from 'mobx-react-lite'

import { TooltipWrapper } from '@hanzo/ui/primitives-common'

import { cn, type FormatThreshold, formatAndAbbreviateAsCurrency } from '@hanzo/ui/util'

import { useSwapState } from '@/contexts/swap-state'

const THRESHOLDS = [
  {
    from: 1000000000,
    use: 'M'
  },
  {
    from: 1000000000000,
    use: 'B'
  },
] satisfies FormatThreshold[]


const DollarValue: React.FC<{
  className?: string
}> = observer(({
  className='',
}) => {

  const swapState = useSwapState()
  const valueRef = useRef<IObservableValue<string | null>>(observable.box(''))
  const tooltipRef = useRef<IObservableValue<string | null>>(observable.box(''))

  useEffect(() => (
    reaction(
      () => ({
        quantity: swapState.fromAssetQuantity,
        price: swapState.fromAssetPriceUSD
      }),
      ({quantity, price}) => {
        const value: number | null = (quantity > 0 && price) ? quantity * price : null 
        const { 
          result, 
          change, 
          full 
        } = formatAndAbbreviateAsCurrency(value, THRESHOLDS)
        //console.log(`RES: ${result}, CH: ${change}, FULL: ${full}`)
        valueRef.current.set(((change === 'rounded') ? '~' : '') + result) 
        tooltipRef.current.set((change === 'rounded') ? full : null)
      },
      { fireImmediately: true }
    )
  ), [])

  return (
    <span className={cn('block cursor-default', className)}>
    {tooltipRef.current.get() ? (
      <TooltipWrapper text={tooltipRef.current.get()!} tooltipClx='text-foreground'>
        <span>{valueRef.current.get()}</span>
      </TooltipWrapper>
    ) : (
      <span>{valueRef.current.get()}</span>  
    )}
    </span>
  )
})

export default DollarValue
