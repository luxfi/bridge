import { useRef } from 'react'
import { observable, runInAction, type IObservableValue } from 'mobx'
import { observer } from 'mobx-react-lite'
import { useDebouncedCallback } from 'use-debounce'

import { cn } from '@hanzo/ui/util'
import { Button, Input } from '@hanzo/ui/primitives-common'

import { useSwapState } from '@/contexts/swap-state'

import AssetCombobox from '../asset-combobox'
import AssetQuantityAvailable from './asset-quantity-available'
import DollarValue from './dollar-value'

const AssetCard: React.FC<{
  assetQuantityAvailable?: number
  onQuantityChanged?: (am: number) => void
  debounceQuantityChangesBy?: number
  className?: string
}> = observer(({
  assetQuantityAvailable,
  onQuantityChanged,
  debounceQuantityChangesBy=600,
  className=''
}) => {

  const swapState = useSwapState()

    // Use this extra state string to better handle initial decimal point
    // and other subtleties.
  const quantityDisplayRef = useRef<IObservableValue<string>>(observable.box(''))

  const debouncedOnQuantityChanged = useDebouncedCallback(
    (v: number) => { onQuantityChanged && onQuantityChanged(v) }, 
    debounceQuantityChangesBy
  )

  const onChange: React.ChangeEventHandler<HTMLInputElement> = (
    event
  ) => {
    let str = event.target.value
    if (str === '.') {
      str = '0.'
    }
    else if (str === '0' && quantityDisplayRef.current.get() === '0.') {
      str = ''
    }
    const newValue = Number(str)
    if (!isNaN(newValue)) {
      runInAction(() => {
        quantityDisplayRef.current.set(str)
      })
    }
    swapState.setFromAssetQuantity(newValue)
    debouncedOnQuantityChanged(newValue)
  }

  const onMaxClicked = () => {
    swapState.setFromAssetQuantity(assetQuantityAvailable!)
    debouncedOnQuantityChanged(assetQuantityAvailable!)
    runInAction(() => {
      quantityDisplayRef.current.set(assetQuantityAvailable!.toString())
    })    
  }

  return (
    <div className={cn('border border-muted-4 py-2 pl-3 pr-1.5 has-[:focus]:border-muted', className)}>
      <div className='flex justify-between items-center gap-1'>
        <Input
          className={
            'min-w-0 text-foreground focus:text-accent bg-level-0 p-1 ' + 
            '!border-none focus:!outline-none focus-visible:!ring-0 focus:!ring-0 text-xl !placeholder-muted-3'
          } 
          lang="en" 
          placeholder='0'
          min='0'
          type='text'
          value={quantityDisplayRef.current.get()}
          onChange={onChange}
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
        <DollarValue />
        <div className='flex items-center shrink-0'>
        { (assetQuantityAvailable && swapState.fromAsset) ? (<>
          <AssetQuantityAvailable 
            quantity={assetQuantityAvailable} 
            maxChars={8}
            fromAssetName={swapState.fromAsset?.name ?? ''}
           />
          <Button 
            variant='outline' 
            onClick={onMaxClicked} 
            size='xs' 
            disabled={assetQuantityAvailable === swapState.fromAssetQuantity}
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
  )
})

export default AssetCard
