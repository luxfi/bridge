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
import { useBalance } from 'wagmi'

import { bridgeIdToWagmiChainId } from '../lib/wagmi-config'
import type { Asset } from '../lib/assets'
import { formatAmount, parseAmount } from '../lib/format'
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
  fontSize: 24,
  fontWeight: 500,
  outline: 'none',
  minWidth: 0,
  padding: 0,
  letterSpacing: '-0.02em',
}

const assetSelectWrap: CSSProperties = {
  width: 140,
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
  // Wagmi balance — only fires for EVM chains where we have a numeric
  // chainId mapping. For non-EVM the hook stays disabled (no spurious
  // refetches, no zero values).
  const wagmiChainId = bridgeIdToWagmiChainId(asset.chainId)
  const enabled = Boolean(walletAddress) && wagmiChainId !== null
  const balanceQuery = useBalance({
    address: (walletAddress ?? undefined) as `0x${string}` | undefined,
    chainId: wagmiChainId ?? undefined,
    ...(asset.contractAddress
      ? { token: asset.contractAddress as `0x${string}` }
      : {}),
    query: { enabled, refetchInterval: 30_000 },
  })

  const balanceText = useMemo(() => {
    if (!enabled) return null
    if (balanceQuery.isLoading) return '…'
    const d = balanceQuery.data
    if (!d) return null
    const value = Number(d.value) / 10 ** d.decimals
    return formatAmount(value, 4)
  }, [enabled, balanceQuery.isLoading, balanceQuery.data])

  const onMax = () => {
    const d = balanceQuery.data
    if (!d) return
    const value = Number(d.value) / 10 ** d.decimals
    if (value <= 0) return
    // Trim to a reasonable precision so the input shows a clean number rather
    // than a 18-digit wei dump. The server will quote the final amount; user
    // confirms before signing.
    onAmountChange(value.toString())
  }

  const options = useMemo(() => assets.map(toAssetOption), [assets])
  const value = useMemo(() => toAssetOption(asset), [asset])

  return (
    <div style={wrap}>
      <div style={labelRow}>
        <span>{label}</span>
        {readOnly ? (
          <span>estimated</span>
        ) : balanceText !== null ? (
          <span style={balanceLine}>
            <span>Balance: {balanceText} {asset.symbol}</span>
            {showMax && balanceText !== '…' && balanceQuery.data ? (
              <button type="button" style={maxBtn} onClick={onMax}>
                Max
              </button>
            ) : null}
          </span>
        ) : null}
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
