// ChainSelector — thin wrapper around the custom Select.
//
// Maps Chain → SelectOption (id/label/secondary/logo) so the popover shows
// the chain mark + name with the family ("EVM" / "Lux" / "SVM") as the
// secondary line. Native <select> has been retired (REQUIREMENTS.md §5.4
// wants the SDK to use proper UI primitives; the native control couldn't
// render logos).

import { useMemo, type CSSProperties, type FC } from 'react'

import type { Chain } from '../lib/chains'
import { Select, type SelectOption } from './Select'

export interface ChainSelectorProps {
  label: string
  chains: Chain[]
  current: Chain
  onChange: (c: Chain) => void
  style?: CSSProperties
}

const familyLabel: Record<Chain['family'], string> = {
  evm: 'EVM',
  lux: 'Lux',
  svm: 'Solana',
  btc: 'Bitcoin',
  ton: 'TON',
  xrp: 'XRP',
  cardano: 'Cardano',
  substrate: 'Polkadot',
}

function toOption(c: Chain): SelectOption {
  return {
    id: c.id,
    label: c.name,
    secondary: familyLabel[c.family] ?? c.family.toUpperCase(),
    ...(c.logoUrl ? { logoUrl: c.logoUrl } : {}),
  }
}

export const ChainSelector: FC<ChainSelectorProps> = ({
  label,
  chains,
  current,
  onChange,
  style,
}) => {
  const options = useMemo(() => chains.map(toOption), [chains])
  const value = useMemo(() => toOption(current), [current])

  return (
    <Select
      label={label}
      value={value}
      options={options}
      onChange={(opt) => {
        const next = chains.find((c) => c.id === opt.id)
        if (next) onChange(next)
      }}
      {...(style ? { style } : {})}
    />
  )
}
