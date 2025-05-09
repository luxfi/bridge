import React, { useState } from 'react'
import Web3 from 'web3'
import { useNotify } from '@/context/toast-provider'
import { useAtom } from 'jotai'
import { useServerAPI } from '@/hooks/useServerAPI'
import { useXrplWallet } from '@/hooks/useXrplWallet'
import { swapStatusAtom, bridgeMintTransactionAtom, userTransferTransactionAtom } from '@/store/teleport'
import SwapItems from './SwapItems'
import { NetworkType } from '@/Models/CryptoNetwork'

interface IProps {
  sourceNetwork: { type: NetworkType; chain_id?: string | number }
  destinationNetwork: { type: NetworkType }
  destinationAddress: string
  sourceAmount: string
  swapId: string
  className?: string
}

const XrplPayoutProcessor: React.FC<IProps> = ({
  sourceNetwork,
  destinationNetwork,
  destinationAddress,
  sourceAmount,
  swapId,
  className,
}) => {
  const { notify } = useNotify()
  const { serverAPI } = useServerAPI()
  const { account, connectXumm, connectLedger, sendPayment } = useXrplWallet()
  const [, setBridgeMintTx] = useAtom(bridgeMintTransactionAtom)
  const [, setSwapStatus] = useAtom(swapStatusAtom)
  const [isPayout, setIsPayout] = useState(false)

  const handleXrplPayout = async () => {
    if (!account) {
      notify('Please connect XRPL wallet first', 'warn')
      return
    }
    try {
      setIsPayout(true)
      const drops = Web3.utils.toWei(sourceAmount, 'mwei')
      const txid = await sendPayment(drops, destinationAddress)
      setBridgeMintTx(txid)
      await serverAPI.post(`/api/swaps/payout/${swapId}`, {
        txHash: txid,
        amount: sourceAmount,
        from: account.address,
        to: destinationAddress,
      })
      setSwapStatus('payout_success')
    } catch (err: any) {
      notify(err?.message || 'XRPL payout failed', 'error')
    } finally {
      setIsPayout(false)
    }
  }

  return (
    <div className={`flex flex-col ${className || ''}`}> 
      <div className="w-full flex flex-col space-y-5">
        <SwapItems
          sourceNetwork={sourceNetwork as any}
          sourceAsset={{ name: '', asset: '' } as any}
          destinationNetwork={destinationNetwork as any}
          destinationAsset={{ name: '', asset: '' } as any}
          destinationAddress={destinationAddress}
          sourceAmount={sourceAmount}
        />
      </div>
      <div className="mt-4 space-y-4">
        {!account && (
          <div className="flex gap-2">
            <button onClick={connectXumm} className="btn">Connect XUMM</button>
            <button onClick={connectLedger} className="btn">Connect Ledger</button>
          </div>
        )}
        {account && (
          <button
            onClick={handleXrplPayout}
            disabled={isPayout}
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            {isPayout ? 'Processing…' : 'Pay & Sign'}
          </button>
        )}
      </div>
    </div>
  )
}

export default XrplPayoutProcessor