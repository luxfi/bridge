import { useState } from 'react'

import type { Asset } from '@luxfi/core'
import { cn } from '@hanzo/ui/util'

import CurrencyInput, { type CurrencyInputOnChangeValues } from './currency-input'
import AssetCombobox from './asset-combobox'

const AssetCard: React.FC<{
  assets: Asset[]
  asset: Asset | null
  setAsset: (asset: Asset | null) => void
  amountChanged: (a: number) => void
  usdValue?: number  
  assetsAvailable: number | null 
  className?: string
}> = ({
  assets,
  asset,
  setAsset,
  amountChanged,
  usdValue,
  assetsAvailable,
  className=''
}) => {

  const [_amount, _setAmount] = useState<number>(0)

    // component ensures a valid number string
  const onAmountChange = (
    value: string | undefined, 
    formatted?: string | undefined, 
    values?: CurrencyInputOnChangeValues | undefined
  ) => {
    const a = value ? Number(value) : 0
    _setAmount(a)
    amountChanged(a)
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
          assets={assets}
          asset={asset}
          setAsset={setAsset}
          buttonClx='shrink-0 border-none'
          popoverAlign='end'
        />
      </div>
      <div className='flex justify-between items-center text-muted text-sm gap-1.5'>
      { (_amount > 0 && usdValue) ? (
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
      <span className={cn('block shrink-0', (assetsAvailable === null || asset === null) ? 'invisible w-[1px] h-[1px] overflow-x-hidden' : '')}>
        {`${assetsAvailable} ${asset?.name} avail`}
      </span>
      </div>
    </div>
  )
}


export default AssetCard
