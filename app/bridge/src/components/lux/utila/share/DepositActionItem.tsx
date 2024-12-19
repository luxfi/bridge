'use client'
import React from 'react'
import { cn } from '@hanzo/ui/util'

import type { DepositAction } from '@/types/utila'
import { Check, ChevronUp, ChevronDown, LucideLoader2 } from 'lucide-react'
import shortenAddress, {
  capitalizeFirstCharacter,
} from '@/components/utils/ShortenAddress'
import ClipboardCopier from '@/components/Swap/Form/Copier'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'

const DepositActionItem: React.FC<{
  data: DepositAction
  asset: NetworkCurrency
  network: CryptoNetwork
}> = ({ data, asset, network }) => {
  const [open, setOpen] = React.useState<boolean>(false)

  const Address = ({
    name,
    value,
    isTx = false,
  }: {
    name: string
    value: string
    isTx?: boolean
  }) => (
    <div className="flex items-center gap-2">
      <span className="text-[#22C55E]">{name}: </span>
      <a
        href={
          !isTx
            ? network?.account_explorer_template?.replace('{0}', value)
            : network?.transaction_explorer_template?.replace('{0}', value)
        }
        target="_blank"
        className="cursor-pointer hover:underline hover:opacity-70"
      >
        {shortenAddress(value, 10)}
      </a>
      <ClipboardCopier text={value} size={16} />
    </div>
  )

  return (
    <div>
      <div className="text-sm flex items-end gap-2">
        {data.status === 'CONFIRMED' ? (
          <Check width={16} height={16} />
        ) : (
          <LucideLoader2 className="animate-spin" width={16} height={16} />
        )}
        <div>
          {capitalizeFirstCharacter(data.status)}{' '}
          <span className="text-[#22C55E]">{data.amount}</span> {asset.asset}{' '}
          Transfer
        </div>
        <div
          className="hover:opacity-70 cursor-pointer"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronUp width={16} height={16} />
          ) : (
            <ChevronDown width={16} height={16} />
          )}
        </div>
      </div>
      <div
        className={cn(
          'pl-6 py-2 opacity-80 text-sm overflow-hidden',
          open ? '' : 'hidden'
        )}
      >
        {data.from === 'unknown sender...' ? (
          <div className="flex items-center gap-2">
            <span className="text-[#22C55E]">From: </span>
            <a className="cursor-pointer hover:underline hover:opacity-70">
              Unknown
            </a>
          </div>
        ) : (
          <Address name="From" value={data.from} />
        )}
        <Address name="To" value={data.to} />
        <Address name="TxHash" value={data.transaction_hash} isTx={true} />
        <div className="flex items-center gap-2">
          <span className="text-[#22C55E]">Created: </span>
          <span>{new Date(data.created_date).toUTCString()}</span>
        </div>
      </div>
    </div>
  )
}

export default DepositActionItem
