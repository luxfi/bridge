'use client'
import React from 'react'

import { useAtom } from 'jotai'

import AmountField from '../AmountField'
import NetworkSelectWrapper from './NetworkSelectWrapper'
import TokenSelectWrapper from './TokenSelectWrapper'

import { truncateDecimals } from '@/components/utils/RoundDecimals'
import { formatNumber } from '@/lib/utils'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'

const NetworkFormField: React.FC<{
  networks: CryptoNetwork[]
  network?: CryptoNetwork
  asset?: NetworkCurrency
  sourceAsset?: NetworkCurrency
  setNetwork: (network: CryptoNetwork) => void
  setAsset: (asset: NetworkCurrency) => void
  disabled: boolean,
  amount: string,
  balance?: number
  balanceLoading: boolean
}> = ({
  networks,
  network,
  asset,
  sourceAsset,
  setNetwork,
  setAsset,
  disabled,
  amount,
  balance, 
  balanceLoading,
}) => {

  const isWithdrawal = React.useMemo(
    () => (sourceAsset?.name?.startsWith("Lux") ? true : false),
    [sourceAsset]
  );

  return (
    <div>
      <label htmlFor={'name'} className="block font-semibold text-xs">
        To
      </label>
      <div className="border border-muted-3 bg-level-1 rounded-lg mt-1.5">
        <NetworkSelectWrapper
          disabled={disabled}
          placeholder={'Destination'}
          setNetwork={setNetwork}
          network={network}
          networks={networks}
          searchHint={'searchHint'}
          className="rounded-b-none border-t-0 border-x-0"
        />
        <div className="flex justify-between items-center gap-1.5 py-2.5 pl-3 pr-4">
          <AmountField
            value={isWithdrawal ? String(truncateDecimals(Number(amount) * 0.99, 10)) : amount}
            disabled={true}
            className='min-w-0'
          />
          <TokenSelectWrapper
            placeholder="Asset"
            values={network ? network.currencies : []}
            value={asset}
            sourceAsset={sourceAsset}
            setValue={setAsset}
            disabled={true}
          />
        </div>
      </div>
      <div className='flex gap-1 justify-end items-end px-4 text-sm text-muted-2 mt-1'>
        <span>Balance:</span> 
        { balanceLoading ? (
          <span className="ml-1 h-3 w-12 rounded-sm bg-level-2 animate-pulse" />
        ) : (
          <span>{formatNumber(balance!)} {asset?.asset}</span> 
        )}
      </div>

    </div>
  )
}

export default NetworkFormField
