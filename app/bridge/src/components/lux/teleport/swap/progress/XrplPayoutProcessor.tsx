import React, { useState } from 'react'
import { useNotify } from '@/context/toast-provider'
import { useAtom } from 'jotai'
import { useServerAPI } from '@/hooks/useServerAPI'
import { useXrplWallet } from '@/hooks/useXrplWallet'
import { swapStatusAtom, bridgeMintTransactionAtom } from '@/store/teleport'
import { xrpToDrops, isValidXrpAddress } from '@/lib/xrpUtils'
import SwapItems from './SwapItems'
import { NetworkType, type CryptoNetwork, type NetworkCurrency } from '@/Models/CryptoNetwork'

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
    
    // Validate XRP destination address
    if (!isValidXrpAddress(destinationAddress)) {
      notify('Invalid XRP destination address', 'error')
      return
    }
    try {
      setIsPayout(true)
      
      // XRP uses 6 decimals, convert amount to drops (1 XRP = 1,000,000 drops)
      const drops = xrpToDrops(sourceAmount)
      
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
      console.error('XRPL payment error:', err)
      if (err?.message?.includes('timeout')) {
        notify('Transaction timeout. The XRP network may be experiencing delays. Please check your XRP wallet for transaction status.', 'error')
      } else if (err?.message?.includes('insufficient funds')) {
        notify('Insufficient funds in your XRP wallet to complete this transaction.', 'error')
      } else if (err?.message?.includes('rejected')) {
        notify('Transaction was rejected. Please try again or use a different wallet.', 'error')
      } else {
        notify(err?.message || 'XRPL payout failed. Please check your XRP wallet and try again.', 'error')
      }
    } finally {
      setIsPayout(false)
    }
  }

  return (
    <div className={`flex flex-col ${className || ''}`}> 
      <div className="w-full flex flex-col space-y-5">
        <SwapItems
          sourceNetwork={{
            ...sourceNetwork,
            display_name: '',
            internal_name: '',
            logo: '',
            native_currency: '',
            is_testnet: false,
            is_featured: false,
            average_completion_time: '',
            status: 'active' as const,
            transaction_explorer_template: '',
            account_explorer_template: '',
            currencies: [],
            metadata: null,
            managed_accounts: [],
            nodes: []
          } as CryptoNetwork}
          sourceAsset={{
            name: '',
            asset: '',
            logo: '',
            contract_address: null,
            decimals: 6,
            status: 'active' as const,
            is_deposit_enabled: false,
            is_withdrawal_enabled: false,
            is_refuel_enabled: false,
            precision: 0,
            price_in_usd: 0,
            is_native: false
          } as NetworkCurrency}
          destinationNetwork={{
            ...destinationNetwork,
            display_name: '',
            internal_name: '',
            logo: '',
            native_currency: '',
            is_testnet: false,
            is_featured: false,
            average_completion_time: '',
            chain_id: undefined,
            status: 'active' as const,
            transaction_explorer_template: '',
            account_explorer_template: '',
            currencies: [],
            metadata: null,
            managed_accounts: [],
            nodes: []
          } as CryptoNetwork}
          destinationAsset={{
            name: '',
            asset: '',
            logo: '',
            contract_address: null,
            decimals: 6,
            status: 'active' as const,
            is_deposit_enabled: false,
            is_withdrawal_enabled: false,
            is_refuel_enabled: false,
            precision: 0,
            price_in_usd: 0,
            is_native: false
          } as NetworkCurrency}
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