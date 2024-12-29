import { observer } from 'mobx-react-lite'

import { cn } from '@hanzo/ui/util'

import CurrencyInput, { type CurrencyInputOnChangeValues } from './currency-input'
import { useSwapState } from '@/contexts/swap-state'

import AssetCombobox from './asset-combobox'

const AssetCard: React.FC<{
  usdValue?: number  
  availableOfAsset?: number
  className?: string
}> = observer(({
  usdValue,
  availableOfAsset,
  className=''
}) => {

  const swapState = useSwapState()

    // component ensures a valid number string
  const onAmountChange = (
    value: string | undefined, 
    formatted?: string | undefined, 
    values?: CurrencyInputOnChangeValues | undefined
  ) => {
    const a = value ? Number(value) : 0
    swapState.setFromAssetQuantity(a)
  }

  return (
    <div className={cn('border border-muted-4 py-2 pl-3 pr-1.5 has-[:focus]:border-muted', className)}>
      <div className='flex justify-between items-center gap-1'>
        <CurrencyInput 
          placeholder='0'
          decimalsLimit={2}
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
          buttonClx='shrink-0 border-none'
          popoverAlign='end'
        />
      </div>
      <div className='flex justify-between items-center text-muted text-sm gap-1.5'>
      { (swapState.fromAssetQuantity > 0 && usdValue) ? (
        <CurrencyInput 
          readOnly
          prefix='$'
          decimalsLimit={2}
          value={usdValue}
          className='cursor-default !border-none bg-level-0 !min-w-0 focus:outline-none'
        />                
      ) : (
        <div/>
      )}
      <span className={cn(
        'block shrink-0', 
        (availableOfAsset === undefined || !swapState.fromAsset) ? 
          'invisible w-[1px] h-[1px] overflow-x-hidden' 
          : 
          ''
      )}>
        {`${availableOfAsset} ${swapState.fromAsset?.name} avail`}
      </span>
      <div>To {swapState.toAsset?.asset ?? ''}</div>
      </div>
    </div>
  )
})

export default AssetCard
