// ChainSelector — native <select> based chain picker.
//
// Native select avoids dragging a popover / portal lib into the SDK and ships
// real working UI today. Phase 3 R2 swaps this for @hanzo/gui's `Select` so
// the visual story matches the rest of the design system.

import type { CSSProperties, FC } from 'react'
import type { Chain } from '../lib/chains'

export interface ChainSelectorProps {
  label: string
  chains: Chain[]
  current: Chain
  onChange: (c: Chain) => void
  style?: CSSProperties
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--bridge-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const selectStyle: CSSProperties = {
  background: 'var(--bridge-bg-input)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-sm)',
  color: 'var(--bridge-text)',
  padding: '10px 12px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
}

export const ChainSelector: FC<ChainSelectorProps> = ({
  label,
  chains,
  current,
  onChange,
  style,
}) => (
  <div style={{ ...wrap, ...style }}>
    <span style={labelStyle}>{label}</span>
    <select
      style={selectStyle}
      value={current.id}
      onChange={(e) => {
        const next = chains.find((c) => c.id === e.target.value)
        if (next) onChange(next)
      }}
      aria-label={`${label} chain`}
    >
      {chains.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  </div>
)
