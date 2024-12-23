"use client";
import React from "react";

import { useAtom } from "jotai";

import { Button } from '@hanzo/ui/primitives'

import AmountField from "../AmountField";
import NetworkSelectWrapper from "./NetworkSelectWrapper";

import TokenSelectWrapper from "@/components/lux/utila/swap/from/TokenSelectWrapper";
import { sourceAmountAtom } from "@/store/utila";
import { formatNumber } from '@/lib/utils'
import type { CryptoNetwork, NetworkCurrency } from "@/Models/CryptoNetwork";


const NetworkFormField: React.FC<{
  networks: CryptoNetwork[]
  network?: CryptoNetwork
  asset?: NetworkCurrency
  setNetwork: (network: CryptoNetwork) => void
  setAsset: (asset: NetworkCurrency) => void
  disabled: boolean,
  maxValue?: string
  balance?: number
  balanceLoading: boolean
}> = ({
  networks,
  network,
  asset,
  setNetwork,
  setAsset,
  disabled,
  maxValue = '0',
  balance, 
  balanceLoading,
}) => {
  const [amount, setAmount] = useAtom(sourceAmountAtom);

  return (
    <div>
      <label htmlFor={"name"} className="block font-semibold text-xs">
        From
      </label>
      <div className="border border-muted-3 bg-level-1 rounded-lg mt-1.5">
        <NetworkSelectWrapper
          disabled={disabled}
          placeholder={"Source"}
          setNetwork={setNetwork}
          network={network}
          networks={networks}
          searchHint={"searchHint"}
          className="rounded-b-none border-t-0 border-x-0"
        />
        <div className="flex justify-between items-center gap-1.5 py-1.5 pl-3 pr-4">
          <AmountField
            disabled={!network}
            value={amount}
            setValue={(value: string) => setAmount(value)}
          />
          <Button variant='outline' onClick={() => {setAmount(maxValue)}} size='xs' className='bg-level-1 mr-1'>
            MAX
          </Button>
          <TokenSelectWrapper
            placeholder="Asset"
            values={network ? network.currencies : []}
            value={asset}
            setValue={setAsset}
            disabled={true}
          />
        </div>
      </div>
      <div className='flex gap-1 justify-end items-end px-4 text-sm text-muted-2  mt-1'>
        <span>Balance:</span> 
        {balanceLoading ? (
          <span className="ml-1 h-3 w-12 rounded-sm bg-level-2 animate-pulse" />
        ) : (
          <span>{formatNumber(balance!)} {asset?.asset}</span> 
        )}
      </div>
    </div>
  );
};

export default NetworkFormField;
