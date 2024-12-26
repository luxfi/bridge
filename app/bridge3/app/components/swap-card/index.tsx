import React, { useRef, useState } from 'react'

import { cn } from '@hanzo/ui/util'

import type { Bridge } from '@/domain/types'

import AssetCard from '../asset-card'
import FromToCard from './from-to-card'
import ReceiveCard from '../receive-card'

const FIXTURE = {
  usdValue: 3345,
  usdFee: 2.4,
  assetGas: .045,
  txnTime: '~5min',
  assetsAvailable: 1004.4556,
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

  return (
    <div className={cn(
      'flex flex-col justify-start items-center p-6 rounded border border-muted-4', 
      className
    )}>
      <FromToCard className='flex w-full gap-2 relative' />
      <AssetCard 
        usdValue={FIXTURE.usdValue}
        availableOfAsset={FIXTURE.assetsAvailable}
        className='w-full rounded-lg mt-2'
      />
      <ReceiveCard
        usdValue={FIXTURE.usdValue}
        usdFee={FIXTURE.usdFee}
        assetGas={FIXTURE.assetGas}
        bridge={FIXTURE.bridge}
        txnTime={FIXTURE.txnTime}
        className=''
      />
    </div>
  )
}

export default SwapCard
