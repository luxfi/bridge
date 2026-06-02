// AssetInput — amount input + asset picker + wallet balance / MAX button.
//
// The asset picker uses the custom Select (so each asset shows its logo and
// the chain name as a secondary line). When a wallet is connected and the
// asset lives on an EVM chain we know about, wagmi's `useBalance` reads the
// native balance (for chain-native tokens) or the ERC-20 balance (for
// tokens carrying a `contractAddress`). For non-EVM assets balance is not
// shown — wagmi can't read it, and surfacing a stale "0" would mislead.
//
// The MAX button fills the input with the full balance. A future iteration
// can subtract a per-chain gas reserve for native tokens, but the server's
// `min_receive_amount` already protects the user from receiving less than
// they bargained for, so we keep this simple.

import { useMemo, type CSSProperties, type FC } from 'react'
import { Input } from '@hanzo/gui'

import type { Asset } from '../lib/assets'
import { formatAmount, parseAmount } from '../lib/format'
import { useWalletForBridgeId } from '../lib/wallet-adapters'
import { Logo, Select, type SelectOption } from './Select'

export interface AssetInputProps {
  label: string
  amount: string
  onAmountChange: (s: string) => void
  asset: Asset
  assets: Asset[]
  onAssetChange: (a: Asset) => void
  readOnly?: boolean
  placeholder?: string
  /** Connected wallet address — drives the balance lookup. */
  walletAddress?: string | null
  /** Show the MAX button. Only meaningful when readOnly is false. */
  showMax?: boolean
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 11,
  color: 'var(--bridge-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
}

const balanceLine: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  textTransform: 'none',
  letterSpacing: 0,
  fontWeight: 500,
  fontSize: 11,
  color: 'var(--bridge-text-muted)',
}

const maxBtn: CSSProperties = {
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
  transition: 'background-color var(--bridge-transition-fast)',
}

const row: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'stretch',
  background: 'var(--bridge-bg-input)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-md)',
  padding: '12px 14px',
}

const inputStyle: CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  color: 'var(--bridge-text)',
  fontSize: 'var(--bridge-input-font-size)',
  fontWeight: 500,
  outline: 'none',
  minWidth: 0,
  padding: 0,
  letterSpacing: '-0.02em',
}

const assetSelectWrap: CSSProperties = {
  width: 'var(--bridge-asset-select-width)',
  flex: 'none',
}

const assetTriggerWrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}

function toAssetOption(a: Asset): SelectOption {
  return {
    id: a.id,
    label: a.symbol,
    secondary: a.name,
    ...(a.logoUrl ? { logoUrl: a.logoUrl } : {}),
  }
}

export const AssetInput: FC<AssetInputProps> = ({
  label,
  amount,
  onAmountChange,
  asset,
  assets,
  onAssetChange,
  readOnly = false,
  placeholder = '0.0',
  walletAddress,
  showMax = false,
}) => {
  // Family-aware balance. useWalletForBridgeId dispatches to:
  //   - wagmi useBalance (EVM/Lux) — native or ERC-20 per tokenAddress
  //   - @solana/wallet-adapter-react (SVM)
  //   - @tonconnect/ui-react + toncenter (TON)
  //   - sats-connect + mempool.space (BTC)
  //   - noop (XRP, Cardano, Substrate — adapter pending)
  //
  // The `walletAddress` prop is now advisory: the family wallet's own
  // connected address takes precedence so the asset picker always
  // shows the balance for the family that asset belongs to.
  const wallet = useWalletForBridgeId(asset.chainId, asset.symbol, asset.contractAddress)

  type BalanceState =
    | { kind: 'amount'; text: string }
    | { kind: 'loading' }
    | { kind: 'no-adapter' }
    | { kind: 'no-wallet' }
    | { kind: 'hidden' }

  const balanceState = useMemo<BalanceState>(() => {
    const state = (() => {
      if (!wallet.connected && !walletAddress) return { kind: 'no-wallet' } as const
      if (wallet.balanceLoading) return { kind: 'loading' } as const
      if (wallet.balance !== null) {
        return { kind: 'amount', text: formatAmount(wallet.balance, 4) } as const
      }
      if (wallet.availableWallets.length === 0 && !wallet.connected) {
        return { kind: 'no-adapter' } as const
      }
      return { kind: 'hidden' } as const
    })()
    console.log('[AssetInput]', label, asset.symbol, 'balanceState=', state.kind, 'wallet=', { connected: wallet.connected, address: wallet.address, balance: wallet.balance, balanceLoading: wallet.balanceLoading, availableWallets: wallet.availableWallets.length }, 'walletAddress=', walletAddress, 'readOnly=', readOnly)
    return state
  }, [wallet, walletAddress, label, asset.symbol, readOnly])

  const onMax = () => {
    if (wallet.balance === null || wallet.balance <= 0) return
    // Trim to a reasonable precision so the input shows a clean number rather
    // than a 18-digit wei dump. The server will quote the final amount; user
    // confirms before signing.
    onAmountChange(wallet.balance.toString())
  }

  const options = useMemo(() => assets.map(toAssetOption), [assets])
  const value = useMemo(() => toAssetOption(asset), [asset])

  const renderBalanceRight = () => {
    if (readOnly) return <span>estimated</span>
    switch (balanceState.kind) {
      case 'amount':
        return (
          <span style={balanceLine}>
            <span>Balance: {balanceState.text} {asset.symbol}</span>
            {showMax ? (
              <button type="button" style={maxBtn} onClick={onMax}>
                Max
              </button>
            ) : null}
          </span>
        )
      case 'loading':
        return <span style={balanceLine}>Balance: … {asset.symbol}</span>
      case 'no-adapter':
        // No wallet adapter for this family yet (XRP, Cardano,
        // Substrate). The bridge's MPC quorum handles signing for
        // these chains.
        return <span style={balanceLine}>MPC-signed — no wallet balance</span>
      case 'no-wallet':
      case 'hidden':
      default:
        return null
    }
  }

  return (
    <div style={wrap}>
      <div style={labelRow}>
        <span>{label}</span>
        {renderBalanceRight()}
      </div>
      <div style={row}>
        <Input
          style={inputStyle}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={amount}
          readOnly={readOnly}
          onChangeText={(v: string) => {
            // Allow empty, partial decimals, or valid positive numbers.
            if (v === '' || v === '.' || parseAmount(v) !== null) {
              onAmountChange(v)
            }
          }}
          aria-label={`${label} amount`}
        />
        <div style={assetSelectWrap}>
          <Select
            value={value}
            options={options}
            onChange={(opt) => {
              const next = assets.find((a) => a.id === opt.id)
              if (next) onAssetChange(next)
            }}
            renderTrigger={(opt) => (
              <div style={assetTriggerWrap}>
                <Logo url={opt.logoUrl} fallback={opt.label} size="sm" />
                <span style={{ fontWeight: 600 }}>{opt.label}</span>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  )
}
