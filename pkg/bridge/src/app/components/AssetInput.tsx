// AssetInput — amount input + native asset select.
//
// Side-by-side text input (amount) and select (asset). Validates numeric
// input on type. Phase 3 R2 replaces this composition with @hanzo/gui's
// `Input` and `Select` primitives.

import type { CSSProperties, FC } from 'react'
import type { Asset } from '../lib/assets'
import { parseAmount } from '../lib/format'

export interface AssetInputProps {
  label: string
  amount: string
  onAmountChange: (s: string) => void
  asset: Asset
  assets: Asset[]
  onAssetChange: (a: Asset) => void
  readOnly?: boolean
  placeholder?: string
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
}

const row: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'stretch',
  background: 'var(--bridge-bg-input)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '8px 10px',
}

const inputStyle: CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  color: 'var(--bridge-text)',
  fontSize: 22,
  fontWeight: 500,
  outline: 'none',
  minWidth: 0,
  padding: 0,
}

const selectStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--bridge-text)',
  fontSize: 15,
  fontWeight: 500,
  outline: 'none',
  cursor: 'pointer',
  paddingRight: 4,
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
}) => (
  <div style={wrap}>
    <div style={labelRow}>
      <span>{label}</span>
      {readOnly && <span>estimated</span>}
    </div>
    <div style={row}>
      <input
        style={inputStyle}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={amount}
        readOnly={readOnly}
        onChange={(e) => {
          const v = e.target.value
          // Allow empty, partial decimals, or valid positive numbers.
          if (v === '' || v === '.' || parseAmount(v) !== null) {
            onAmountChange(v)
          }
        }}
        aria-label={`${label} amount`}
      />
      <select
        style={selectStyle}
        value={asset.id}
        onChange={(e) => {
          const next = assets.find((a) => a.id === e.target.value)
          if (next) onAssetChange(next)
        }}
        aria-label={`${label} asset`}
      >
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.symbol}
          </option>
        ))}
      </select>
    </div>
  </div>
)
