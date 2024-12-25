import React, { useRef, useState } from 'react'

import { cn } from '@hanzo/ui/util'

import type { Network, Asset } from '@luxfi/core'
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
  fromNetworks: Network[]
  fromInitial?: Network | null
  toNetworks: Network[]
  toInitial?: Network | null
}> = ({
  className='',
  fromNetworks,
  fromInitial,
  toNetworks,
  toInitial,
}) => {

  const _from = useRef<Network | null>(fromInitial ?? null)
  const _to = useRef<Network | null>(toInitial ?? null)
  const _fromNetworks = useRef<Network[]>(fromNetworks)
  const _toNetworks = useRef<Network[]>(toNetworks)
  const _asset = useRef<Asset | null>(fromInitial?.currencies![0] ?? null)
  const _amount = useRef<number>(0)
  const [triggerUpdate, setTriggerUpdate] = useState<boolean>(false) 

  const update = () => {setTriggerUpdate((c) => (!c))}

  const setFrom = (v: Network | null) => {
    _from.current = v
    update()
  }
 
  const setTo = (v: Network | null) => {
    _to.current = v
    update()
  }
 
  const setAmount = (n: number) => {
    _amount.current = n
  }

  const setAsset = (t: Asset | null) => {
    _asset.current = t
    update()
  }

  const swapFromAndTo = () => {
    const tmp = _from.current
    _from.current = _to.current
    _to.current = tmp
    const tmpNetworks = _fromNetworks.current
    _fromNetworks.current = _toNetworks.current
    _toNetworks.current = tmpNetworks
    setTriggerUpdate((c) => (!c))
  }

  return (
    <div className={cn(
      'flex flex-col justify-start items-center p-6 rounded border border-muted-4', 
      className
    )}>
      <FromToCard 
        swapFromAndTo={swapFromAndTo}
        from={_from.current}
        to={_to.current}
        fromNetworks={_fromNetworks.current}
        toNetworks={_toNetworks.current}
        setFrom={setFrom}
        setTo={setTo}
        className='flex w-full gap-2 relative'
      />
      <AssetCard 
        assets={_from.current?.currencies!}
        asset={_asset.current}
        setAsset={setAsset}
        usdValue={FIXTURE.usdValue}
        amountChanged={setAmount}
        assetsAvailable={FIXTURE.assetsAvailable}
        className='w-full rounded-lg mt-2'
      />
      {_amount.current > 0 && (
        <ReceiveCard
          from={_from.current!}
          to={_to.current!}
          asset={_asset.current!}
          usdValue={FIXTURE.usdValue}
          usdFee={FIXTURE.usdFee}
          assetGas={FIXTURE.assetGas}
          bridge={FIXTURE.bridge}
          txnTime={FIXTURE.txnTime}
          className=''
        />
      )}
    </div>
  )
}

export default SwapCard
