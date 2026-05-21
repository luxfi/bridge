// ChainSelector — native <select> based chain picker.
//
// Native select avoids dragging a popover / portal lib into the SDK and ships
// real working UI today. Phase 3 R2.5 swaps the layout + label primitives
// onto `@hanzo/gui`; the `<select>` element stays native HTML because
// `@hanzogui/select` is a heavy compound component (Portal + Sheet + Adapt)
// that would change the render shape and pull a popover stack into the
// bundle. See R2.5 report.

import type { CSSProperties, FC } from 'react'
import { Text, YStack } from '@hanzo/gui'
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
  <YStack style={{ ...wrap, ...style }}>
    <Text style={labelStyle}>{label}</Text>
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
  </YStack>
)
