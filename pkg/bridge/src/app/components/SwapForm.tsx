// SwapForm — the primary bridge UI.
//
// Composes ChainSelector + AssetInput + a reverse button + a submit button
// against the SwapState hook. Submitting drops a transfer onto the
// TransferState which TransferStatus renders below.

import { useState, type CSSProperties, type FC } from 'react'
import { Button } from '@hanzo/gui'
import type { SwapState } from '../hooks/useSwap'
import type { WalletState } from '../hooks/useWallet'
import type { TransferState } from '../hooks/useTransfers'
import { formatAmount, formatUsd } from '../lib/format'
import { Card } from './Card'
import { ChainSelector } from './ChainSelector'
import { AssetInput } from './AssetInput'

export interface SwapFormProps {
  swap: SwapState
  wallet: WalletState
  transfers: TransferState
}

const chainsRow: CSSProperties = {
  display: 'flex',
  gap: 10,
  position: 'relative',
  alignItems: 'flex-end',
}

const reverseBtn: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'var(--bridge-bg-elevated)',
  border: '1px solid var(--bridge-border)',
  borderRadius: '50%',
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--bridge-text-muted)',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  lineHeight: 1,
}

const quoteRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  color: 'var(--bridge-text-muted)',
}

const submit: CSSProperties = {
  marginTop: 8,
  background: 'var(--bridge-accent)',
  color: 'white',
  border: 'none',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
}

const submitDisabled: CSSProperties = {
  ...submit,
  background: 'var(--bridge-bg-input)',
  color: 'var(--bridge-text-muted)',
  cursor: 'not-allowed',
}

const errorBox: CSSProperties = {
  background: 'rgba(244, 67, 54, 0.08)',
  border: '1px solid rgba(244, 67, 54, 0.4)',
  color: 'var(--bridge-danger)',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '8px 10px',
  fontSize: 12,
}

export const SwapForm: FC<SwapFormProps> = ({ swap, wallet, transfers }) => {
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    wallet.address !== null &&
    swap.quote !== null &&
    swap.fromChain.id !== swap.toChain.id

  const submitLabel = (() => {
    if (!wallet.address) return 'Connect wallet to bridge'
    if (swap.fromChain.id === swap.toChain.id) {
      return 'Source and destination must differ'
    }
    if (!swap.quote) return 'Enter an amount'
    return `Bridge ${swap.fromAsset.symbol} → ${swap.toAsset.symbol}`
  })()

  const onSubmit = () => {
    setError(null)
    if (!swap.quote || !wallet.address) {
      setError('Wallet must be connected with a valid quote.')
      return
    }
    transfers.submit({
      fromChainId: swap.fromChain.id,
      toChainId: swap.toChain.id,
      fromAssetId: swap.fromAsset.id,
      toAssetId: swap.toAsset.id,
      inAmount: Number(swap.amount),
      outAmount: swap.quote.outAmount,
    })
    // Clear input on successful submit so the next intent starts fresh.
    swap.setAmount('')
  }

  return (
    <Card>
      <div style={chainsRow}>
        <ChainSelector
          label="From"
          chains={swap.chains}
          current={swap.fromChain}
          onChange={swap.setFromChain}
        />
        <Button
          style={reverseBtn}
          onClick={swap.reverse}
          aria-label="Swap from and to chains"
        >
          ⇄
        </Button>
        <ChainSelector
          label="To"
          chains={swap.chains}
          current={swap.toChain}
          onChange={swap.setToChain}
        />
      </div>

      <AssetInput
        label="You send"
        amount={swap.amount}
        onAmountChange={swap.setAmount}
        asset={swap.fromAsset}
        assets={swap.fromAssetOptions}
        onAssetChange={swap.setFromAsset}
      />

      <AssetInput
        label="You receive"
        amount={swap.quote ? formatAmount(swap.quote.outAmount, 6) : ''}
        onAmountChange={() => {/* read-only */}}
        asset={swap.toAsset}
        assets={swap.toAssetOptions}
        onAssetChange={swap.setToAsset}
        readOnly
        placeholder="—"
      />

      {swap.quote ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={quoteRow}>
            <span>Rate</span>
            <span>
              1 {swap.fromAsset.symbol} ≈ {formatAmount(swap.quote.rate, 6)}{' '}
              {swap.toAsset.symbol}
            </span>
          </div>
          <div style={quoteRow}>
            <span>Fee</span>
            <span>{formatUsd(swap.quote.feeUsd)}</span>
          </div>
          <div style={quoteRow}>
            <span>Est. time</span>
            <span>{swap.quote.etaText}</span>
          </div>
        </div>
      ) : null}

      {error ? <div style={errorBox}>{error}</div> : null}

      <Button
        style={canSubmit ? submit : submitDisabled}
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </Card>
  )
}
