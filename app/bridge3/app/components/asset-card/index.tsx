import { observer } from 'mobx-react-lite'
import { useDebouncedCallback } from 'use-debounce'

import { cn } from '@hanzo/ui/util'
import { Button } from '@hanzo/ui/primitives-common'

import { useSwapState } from '@/contexts/swap-state'

import CurrencyInput, { type CurrencyInputOnChangeValues } from '../currency-input'
import AssetCombobox from '../asset-combobox'
import AmountAvailable from './amount-available'

const AssetCard: React.FC<{
  availableOfAsset?: number
  onAmountChanged?: (am: number) => void
  className?: string
}> = observer(({
  availableOfAsset,
  onAmountChanged,
  className=''
}) => {

  const swapState = useSwapState()

  const debouncedOnAmountChanged = useDebouncedCallback(
    (v: number) => { onAmountChanged && onAmountChanged(v) }, 
    600
  )

  const onAmountChange = (
    value: string | undefined, 
    ignoreMe?: string | undefined, 
    ignoreMeToo?: CurrencyInputOnChangeValues | undefined
  ) => {
      // Safe, as component ensures a valid number string
    const amount = value ? Number(value) : 0
    swapState.setFromAssetQuantity(amount)
    debouncedOnAmountChanged(amount)
  }

  const onMaxClicked = () => {
    swapState.setFromAssetQuantity(availableOfAsset!)
  }

  return (<>
    <div className={cn('border border-muted-4 py-2 pl-3 pr-1.5 has-[:focus]:border-muted', className)}>
      <div className='flex justify-between items-center gap-1'>
        <CurrencyInput 
          allowDecimals
          placeholder='0'
          disableGroupSeparators
          decimalsLimit={6}
          value={swapState.fromAssetQuantity}
          onValueChange={onAmountChange}
          className={
            'min-w-0 text-foreground focus:text-accent bg-level-0 p-1 ' + 
            '!border-none focus:outline-none text-xl !placeholder-muted-3'
          }
        />
        <AssetCombobox 
          assets={swapState.fromAssets}
          asset={swapState.fromAsset}
          setAsset={swapState.setFromAsset}
          buttonClx='shrink-0 border-none pr-0 -mr-1'
          popoverAlign='end'
        />
      </div>
      <div className='flex justify-between items-center text-muted text-sm gap-1.5'>
      { (swapState.fromAssetQuantity > 0 && swapState.fromAssetPriceUSD) ? (
        <CurrencyInput 
          readOnly
          prefix='$'
          decimalScale={2}
          value={swapState.fromAssetPriceUSD * swapState.fromAssetQuantity}
          className='cursor-default !border-none bg-level-0 !min-w-0 shrink focus:outline-none'
        />                
      ) : (
        <div/>
      )}
        <div className='flex items-center shrink-0'>
        { (availableOfAsset && swapState.fromAsset) ? (<>
          <AmountAvailable 
            amount={availableOfAsset} 
            maxChars={8}
            fromAssetName={swapState.fromAsset?.name ?? ''}
           />
          <Button 
            variant='outline' 
            onClick={onMaxClicked} 
            size='xs' 
            disabled={availableOfAsset === swapState.fromAssetQuantity}
            className='font-sans text-muted bg-level-1 ml-2 h-6'
          >
            max
          </Button>
        </>) : (
          <div />
        )}
        </div>
      </div>
    </div>
  </>)
})

export default AssetCard
