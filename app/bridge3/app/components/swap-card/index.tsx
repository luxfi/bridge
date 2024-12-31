import React, { useRef, useState } from 'react'

import { cn } from '@hanzo/ui/util'

import type { Bridge } from '@/domain/types'

import AssetCard from '../asset-card'
import FromToCard from './from-to-card'
import ReceiveCard from '../receive-card'
import TeleportSwitch from '../teleport-switch'
import { useSwapState } from '@/contexts/swap-state'

const FIXTURE = {
  usdFee: 2.4,
  assetGas: .045,
  txnTime: '~5min',
  assetsAvailable: 1.4556567,
  bridge: {
    name: 'Across',
    logo: 'https://cdn.lux.network/bridge/currencies/dai.png',
  } as Bridge
}


const SwapCard: React.FC<{
  className?: string
}> = ({
  className='',
}) => {

  const swapState = useSwapState()

  const [debouncedAmount, setDebouncedAmount] = useState<number | null>(swapState.fromAssetQuantity ?? null)

  return (
    <div className={cn(
      'flex flex-col justify-start items-center px-6 py-4 gap-4 rounded border border-muted-4', 
      className
    )}>
      <div className='flex justify-start w-full mt-2'>
        <TeleportSwitch switchClx='h-4 w-8' thumbClx='h-[15px] w-[15px]'/>
      </div>
      <FromToCard className='flex w-full gap-2 relative' />
      <AssetCard 
        availableOfAsset={FIXTURE.assetsAvailable}
        onAmountChanged={setDebouncedAmount}
        className='w-full rounded-lg mt-2'
      />
      <ReceiveCard
        amount={debouncedAmount}
        usdFee={FIXTURE.usdFee}
        assetGas={FIXTURE.assetGas}
        bridge={FIXTURE.bridge}
        txnTime={FIXTURE.txnTime}
        className='w-full rounded-lg'
      />
    </div>
  )
}

export default SwapCard
