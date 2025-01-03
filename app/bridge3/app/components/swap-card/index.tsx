import React, { useState } from 'react'

import { cn } from '@hanzo/ui/util'

import AssetCard from '../asset-card'
import FromToCard from './from-to-card'
import ReceiveCard from '../receive-card'
import { useSwapState } from '@/contexts/swap-state'

const FIXTURE = {
  usdFee: 2.4,
  assetGas: .045,
  txnTime: '~5min',
  assetsAvailable: 134.56676767676,
}

const SwapCard: React.FC<{
  className?: string
}> = ({
  className='',
}) => {

  const swapState = useSwapState()
    // AssetCard debounces this change so use a sep state var
  const [quantity, setQuantity] = useState<number | null>(swapState.fromAssetQuantity ?? null)

  return (
    <div className={cn(
      'flex flex-col justify-start items-center',
      'px-6 py-4 gap-4 rounded border border-muted-4', 
      className
    )}>
      <FromToCard className='flex w-full gap-2 relative' />
      <AssetCard 
        assetQuantityAvailable={FIXTURE.assetsAvailable}
        onQuantityChanged={setQuantity}
        className='w-full rounded-lg mt-2'
      />
      <ReceiveCard
        quantity={quantity}
        usdFee={FIXTURE.usdFee}
        assetGas={FIXTURE.assetGas}
        txnTime={FIXTURE.txnTime}
        className='w-full rounded-lg'
      />
    </div>
  )
}

export default SwapCard
