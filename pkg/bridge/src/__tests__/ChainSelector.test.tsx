// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// ChainSelector is a thin Chain<->SelectOption mapping layer around
// Select, but the mapping itself has real logic worth pinning: the
// family->display-name table, and the reverse lookup that turns a
// selected SelectOption back into the original Chain object (a wrong
// id match here would silently call onChange with the wrong chain).

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Chain } from '../app/lib/chains'
import { ChainSelector } from '../app/components/ChainSelector'

function chain(overrides: Partial<Chain>): Chain {
  return {
    id: 'evm:1',
    internalName: 'ETHEREUM_MAINNET',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
    ...overrides,
  }
}

// Names deliberately differ from their family's display label (e.g.
// "Solana Devnet" vs. the family label "Solana") so primary and
// secondary text never collide in a getByText query.
const eth = chain({ id: 'evm:1', name: 'Ethereum Mainnet', family: 'evm' })
const sol = chain({ id: 'svm:101', name: 'Solana Devnet', symbol: 'SOL', family: 'svm' })
const ton = chain({ id: 'ton:mainnet', name: 'TON Testnet', symbol: 'TON', family: 'ton' })

describe('ChainSelector — family label mapping', () => {
  it('shows the family display name as the secondary label', () => {
    render(
      <ChainSelector label="From" chains={[eth, sol, ton]} current={eth} onChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: /From/ }))
    expect(screen.getByText('EVM')).toBeTruthy()
    expect(screen.getByText('Solana')).toBeTruthy()
    expect(screen.getByText('TON')).toBeTruthy()
  })

  it('falls back to the raw uppercased family when not in the display table', () => {
    // Cast past the ChainFamily union deliberately: this simulates a
    // future family added to the type without a matching label-table
    // entry, which the component is defensively coded to handle.
    const mystery = chain({ id: 'mystery:1', name: 'Mystery Chain', family: 'nearprotocol' as Chain['family'] })
    render(
      <ChainSelector label="From" chains={[eth, mystery]} current={eth} onChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: /From/ }))
    expect(screen.getByText('NEARPROTOCOL')).toBeTruthy()
  })
})

describe('ChainSelector — selection', () => {
  it('calls onChange with the matching Chain object, not the SelectOption', () => {
    const onChange = vi.fn()
    render(
      <ChainSelector label="From" chains={[eth, sol, ton]} current={eth} onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: /From/ }))
    fireEvent.mouseDown(screen.getByRole('option', { name: /Solana/ }))
    expect(onChange).toHaveBeenCalledWith(sol)
  })

  it('renders the field label', () => {
    render(<ChainSelector label="Destination" chains={[eth]} current={eth} onChange={vi.fn()} />)
    expect(screen.getByText('Destination')).toBeTruthy()
  })
})
