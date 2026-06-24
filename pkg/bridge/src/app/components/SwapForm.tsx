// SwapForm — the primary bridge UI.
//
// Composes ChainSelector + AssetInput + a reverse button + a submit button
// against the SwapState hook. Submitting drops a transfer onto the
// TransferState which TransferStatus renders below.
//
// Refuel toggle, balance + MAX button on the "You send" input, and the
// 2-of-2 cosigner notice all live here. The visual layer uses theme tokens
// from `styles/theme.css` (no hard-coded hex other than fallbacks).

import { useState, type CSSProperties, type FC } from 'react'
import { Button } from '@hanzo/gui'
import { getConfig } from '../../config'
import type { SwapState } from '../hooks/useSwap'
import type { BridgeWallet } from '../hooks/useBridgeWallet'
import type { TransferState } from '../hooks/useTransfers'
import { formatAmount, formatUsd } from '../lib/format'
import { Card } from './Card'
import { ChainSelector } from './ChainSelector'
import { AssetInput } from './AssetInput'

export interface SwapFormProps {
  swap: SwapState
  wallet: BridgeWallet
  transfers: TransferState
}

const chainsRow: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-end',
}

// Reverse button sits between the two ChainSelectors as a regular flex
// child. `alignSelf: flex-end` keeps it level with the dropdowns even
// though each ChainSelector renders a label above its dropdown (the labels
// would otherwise pull the row center upward and float the button into the
// label band). Native <button> because @hanzo/gui's Button enforces its own
// min-width / padding that swamps the 34×34 hit target and hides the glyph.
const reverseBtn: CSSProperties = {
  alignSelf: 'flex-end',
  flexShrink: 0,
  marginBottom: 6,
  background: 'var(--bridge-bg-elevated)',
  border: '1px solid var(--bridge-border-strong)',
  borderRadius: '50%',
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--bridge-text)',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  lineHeight: 1,
  padding: 0,
  transition: 'background-color var(--bridge-transition-fast), border-color var(--bridge-transition-fast), transform var(--bridge-transition-fast)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
}

const quoteCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 12,
  background: 'var(--bridge-bg-soft)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-md)',
}

const quoteRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  color: 'var(--bridge-text-muted)',
}

const quoteRowStrong: CSSProperties = {
  ...quoteRow,
  color: 'var(--bridge-text)',
  fontWeight: 500,
}

const submit: CSSProperties = {
  marginTop: 4,
  background:
    'linear-gradient(180deg, var(--bridge-accent-hover) 0%, var(--bridge-accent) 100%)',
  color: 'white',
  border: 'none',
  borderRadius: 'var(--bridge-radius-md)',
  padding: '14px 16px',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  cursor: 'pointer',
  width: '100%',
  transition: 'transform var(--bridge-transition-fast), filter var(--bridge-transition-fast)',
  boxShadow: '0 6px 20px var(--bridge-accent-soft)',
}

const submitDisabled: CSSProperties = {
  ...submit,
  background: 'var(--bridge-bg-input)',
  color: 'var(--bridge-text-muted)',
  cursor: 'not-allowed',
  boxShadow: 'none',
}

const errorBox: CSSProperties = {
  background: 'var(--bridge-danger-soft)',
  border: '1px solid var(--bridge-danger-border)',
  color: 'var(--bridge-danger)',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '8px 10px',
  fontSize: 12,
}

const noticeBox: CSSProperties = {
  background: 'var(--bridge-accent-soft)',
  border: '1px solid var(--bridge-accent-border)',
  color: 'var(--bridge-text-muted)',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '8px 10px',
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const noticeBadge: CSSProperties = {
  display: 'inline-block',
  padding: '2px 6px',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  borderRadius: 4,
  background: 'rgba(91, 141, 239, 0.18)',
  color: 'var(--bridge-accent)',
}

const refuelRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  background: 'var(--bridge-bg-soft)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-sm)',
  fontSize: 12,
  color: 'var(--bridge-text-muted)',
}

const refuelLabel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const destWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const destLabelRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 11,
  color: 'var(--bridge-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
}

const destUseWalletBtn: CSSProperties = {
  background: 'var(--bridge-accent-soft)',
  color: 'var(--bridge-accent)',
  border: '1px solid var(--bridge-accent-border)',
  borderRadius: 'var(--bridge-radius-pill)',
  padding: '2px 8px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const destInput: CSSProperties = {
  width: '100%',
  background: 'var(--bridge-bg-input)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-md)',
  color: 'var(--bridge-text)',
  padding: '10px 12px',
  fontSize: 13,
  outline: 'none',
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
}

const destHint: CSSProperties = {
  fontSize: 10,
  color: 'var(--bridge-text-subtle)',
  letterSpacing: 0,
  textTransform: 'none',
  fontWeight: 400,
}

const refuelTitle: CSSProperties = {
  color: 'var(--bridge-text)',
  fontWeight: 500,
  fontSize: 12,
}

const toggleTrack = (active: boolean): CSSProperties => ({
  width: 32,
  height: 18,
  borderRadius: 'var(--bridge-radius-pill)',
  background: active ? 'var(--bridge-accent)' : 'var(--bridge-border-strong)',
  border: 'none',
  cursor: 'pointer',
  position: 'relative',
  padding: 0,
  transition: 'background-color var(--bridge-transition-fast)',
})

const toggleKnob = (active: boolean): CSSProperties => ({
  position: 'absolute',
  top: 2,
  left: active ? 16 : 2,
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: 'white',
  transition: 'left var(--bridge-transition-fast)',
})

export const SwapForm: FC<SwapFormProps> = ({ swap, wallet, transfers }) => {
  const [error, setError] = useState<string | null>(null)
  const [destinationAddress, setDestinationAddress] = useState<string>('')
  const cfg = getConfig()

  // Layered-cosigner indicator. When a tenant has set `mpc.utila` and/or
  // `mpc.fireblocks`, every settlement is 2-of-2 — native Lux MPC sign AND
  // external custodian approval. Surfacing this to the user is the only
  // safe way to communicate "this transfer needs two independent approvals"
  // before they sign.
  const cosigners: string[] = []
  if (cfg.mpc?.utila) cosigners.push('Utila')
  if (cfg.mpc?.fireblocks) cosigners.push('Fireblocks')

  // Every source goes through the MPC deposit-address flow: the server
  // mints a fresh MPC-derived address via createMPCWalletForDeposit() and
  // the user pays it from any wallet they own (MetaMask for EVM/Lux,
  // native BTC wallet for Bitcoin, Solana wallet for SOL, etc.). There is
  // no wagmi writeContract path on the source side — the SDK never holds
  // a private key and never calls a teleporter contract directly.
  const sourceIsEvm =
    swap.fromChain.family === 'evm' || swap.fromChain.family === 'lux'
  const needsDepositAddressFlow = true

  // Source-chain wallet address, resolved across BOTH stacks: wagmi for
  // EVM/Lux, @luxwallet/connect for Solana/Bitcoin/TON/XRP/Polkadot. A
  // Solana wallet only satisfies a Solana source, etc. (see addressFor).
  const sourceAddress = wallet.addressFor(swap.fromChain.family)
  // Destination address for the "Use wallet" affordance — prefer the source
  // wallet, but only when it could be a valid destination (i.e. same family
  // self-bridge). For cross-family bridges the user pastes the destination.
  const destWalletAddress = wallet.addressFor(swap.toChain.family)

  // Destination address resolution. We always need an address to deliver
  // bridged funds to. When a wallet is connected for the destination chain
  // we default to it (typical self-bridge); otherwise the user pastes one.
  const effectiveDestination = (
    destinationAddress.trim() ||
    destWalletAddress ||
    ''
  ).trim()
  const destOk = effectiveDestination.length > 0

  const canSubmit =
    swap.quote !== null &&
    !swap.quoting &&
    swap.fromChain.id !== swap.toChain.id &&
    destOk &&
    // A connected source wallet is required for EVM/Lux (the user signs the
    // deposit). For non-EVM sources a connected wallet is now offered too
    // (@luxwallet/connect), but connect is not mandatory — the user can still
    // send to the MPC deposit address from any wallet they hold.
    (sourceIsEvm ? sourceAddress !== null : true)

  const submitLabel = (() => {
    if (swap.fromChain.id === swap.toChain.id) {
      return 'Source and destination must differ'
    }
    if (swap.quoting) return 'Fetching quote…'
    if (!swap.quote) return 'Enter an amount'
    if (sourceIsEvm && !sourceAddress) return 'Connect wallet to bridge'
    if (!destOk) return `Enter ${swap.toChain.name} destination address`
    return `Bridge ${swap.fromAsset.symbol} → ${swap.toAsset.symbol}`
  })()

  const onSubmit = () => {
    setError(null)
    if (!swap.quote) {
      setError('Quote required.')
      return
    }
    if (!destOk) {
      setError('Destination address required.')
      return
    }
    if (sourceIsEvm && !sourceAddress) {
      setError('Wallet must be connected for EVM source chains.')
      return
    }
    transfers.submit({
      fromChainId: swap.fromChain.id,
      toChainId: swap.toChain.id,
      fromAssetId: swap.fromAsset.id,
      toAssetId: swap.toAsset.id,
      inAmount: Number(swap.amount),
      outAmount: swap.quote.outAmount,
      refuel: swap.refuel,
      destinationAddress: effectiveDestination,
      useDepositAddress: needsDepositAddressFlow,
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
        <button
          type="button"
          style={reverseBtn}
          onClick={swap.reverse}
          aria-label="Swap from and to chains"
          title="Swap source and destination"
        >
          ⇅
        </button>
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
        walletAddress={sourceAddress}
        showMax
      />

      <AssetInput
        label="You receive"
        amount={swap.quote ? formatAmount(swap.quote.outAmount, 6) : ''}
        onAmountChange={() => {/* read-only */}}
        asset={swap.toAsset}
        assets={swap.toAssetOptions}
        onAssetChange={swap.setToAsset}
        walletAddress={destWalletAddress}
        readOnly
        placeholder="—"
      />

      <div style={destWrap}>
        <div style={destLabelRow}>
          <span>Destination address</span>
          {destWalletAddress && destinationAddress.trim() !== '' && destinationAddress.trim() !== destWalletAddress ? (
            <button
              type="button"
              style={destUseWalletBtn}
              onClick={() => setDestinationAddress('')}
              title="Reset to connected wallet"
            >
              Use wallet
            </button>
          ) : null}
        </div>
        <input
          type="text"
          style={destInput}
          placeholder={
            destWalletAddress
              ? `${destWalletAddress.slice(0, 6)}…${destWalletAddress.slice(-4)} (connected wallet)`
              : `Paste your ${swap.toChain.name} address`
          }
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="Destination address"
        />
        <span style={destHint}>
          The bridge will issue an MPC-secured deposit address — send your{' '}
          {swap.fromAsset.symbol} from any {swap.fromChain.name} wallet to
          that address and the {swap.toAsset.symbol} will arrive at your
          destination after the threshold quorum signs.
        </span>
      </div>

      <div style={refuelRow}>
        <div style={refuelLabel}>
          <span style={refuelTitle}>Refuel destination gas</span>
          <span>Receive a small amount of {swap.toChain.symbol} for fees on arrival.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={swap.refuel}
          aria-label="Toggle refuel"
          style={toggleTrack(swap.refuel)}
          onClick={() => swap.setRefuel(!swap.refuel)}
        >
          <span style={toggleKnob(swap.refuel)} aria-hidden />
        </button>
      </div>

      {swap.quote ? (
        <div style={quoteCard}>
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
          <div style={quoteRowStrong}>
            <span>Min receive</span>
            <span>
              {formatAmount(swap.quote.minOut, 6)} {swap.toAsset.symbol}
            </span>
          </div>
          <div style={quoteRow}>
            <span>Est. time</span>
            <span>{swap.quote.etaText}</span>
          </div>
        </div>
      ) : swap.quoting ? (
        <div style={quoteCard}>
          <div style={quoteRow}>
            <span>Fetching quote from {cfg.apiHost.replace(/^https?:\/\//, '')}…</span>
          </div>
        </div>
      ) : null}

      {swap.quoteError ? (
        <div style={errorBox}>{swap.quoteError}</div>
      ) : null}

      {cosigners.length > 0 ? (
        <div style={noticeBox}>
          <span style={noticeBadge}>2-of-2</span>
          <span>
            Settlement gated by native Lux MPC + {cosigners.join(' + ')} cosign.
          </span>
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
