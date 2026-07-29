// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// AssetInput had zero test coverage despite driving balance display +
// the MAX button + the asset picker for every swap side. Worth
// covering on its own: the balanceState derivation in the component
// silently drifted from a stale comment claiming XRP had "no wallet
// adapter" when it's had a real Xaman one since 2026-06-05 — the kind
// of thing a test would have caught by construction (assert on
// behavior, not on the comment).
//
// @hanzo/gui's Input is mocked to a plain <input> — it's a
// styled(View, ...) primitive from the cross-platform design system,
// and no other component test in this file exercises it directly, so
// there's no established precedent that it renders cleanly under
// happy-dom. Mocking it keeps this test about AssetInput's own logic
// (balance-state derivation, MAX button, asset switching, amount
// validation), not the design system's internals. Select/Logo (this
// package's own components) are rendered for real — pure React, no
// external UI-library dependency, confirmed by reading Select.tsx.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@hanzo/gui', () => ({
  Input: (props: {
    'aria-label'?: string
    placeholder?: string
    value: string
    readOnly?: boolean
    onChangeText?: (v: string) => void
  }) => (
    <input
      aria-label={props['aria-label']}
      placeholder={props.placeholder}
      value={props.value}
      readOnly={props.readOnly}
      onChange={(e) => props.onChangeText?.(e.target.value)}
    />
  ),
}))

type MockWallet = {
  connected: boolean
  balance: number | null
  balanceLoading: boolean
  availableWallets: { name: string; icon?: string }[]
}

let walletState: MockWallet = {
  connected: false,
  balance: null,
  balanceLoading: false,
  availableWallets: [],
}

vi.mock('../app/lib/wallet-adapters', () => ({
  useWalletForBridgeId: () => ({
    family: 'evm',
    address: null,
    connected: walletState.connected,
    connecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    balance: walletState.balance,
    balanceSymbol: null,
    balanceLoading: walletState.balanceLoading,
    availableWallets: walletState.availableWallets,
  }),
}))

import type { Asset } from '../app/lib/assets'
import { AssetInput } from '../app/components/AssetInput'

const xrp: Asset = {
  id: 'xrp:mainnet:XRP',
  symbol: 'XRP',
  name: 'Ripple',
  chainId: 'xrp:mainnet',
  decimals: 6,
}
const sol: Asset = {
  id: 'svm:mainnet:SOL',
  symbol: 'SOL',
  name: 'Solana',
  chainId: 'svm:mainnet',
  decimals: 9,
}
const assets = [xrp, sol]

function renderInput(overrides: Partial<React.ComponentProps<typeof AssetInput>> = {}) {
  const onAmountChange = vi.fn()
  const onAssetChange = vi.fn()
  render(
    <AssetInput
      label="You send"
      amount=""
      onAmountChange={onAmountChange}
      asset={xrp}
      assets={assets}
      onAssetChange={onAssetChange}
      {...overrides}
    />,
  )
  return { onAmountChange, onAssetChange }
}

beforeEach(() => {
  walletState = {
    connected: false,
    balance: null,
    balanceLoading: false,
    availableWallets: [],
  }
})

describe('AssetInput — balance state', () => {
  it('renders nothing when not connected and no advisory walletAddress (no-wallet)', () => {
    renderInput()
    expect(screen.queryByText(/^Balance:/)).toBeNull()
    expect(screen.queryByText(/MPC-signed/)).toBeNull()
  })

  it('shows a loading placeholder while the balance is resolving', () => {
    walletState = { ...walletState, connected: true, balanceLoading: true }
    renderInput()
    expect(screen.getByText('Balance: … XRP')).toBeTruthy()
  })

  it('shows the formatted balance once resolved', () => {
    walletState = { ...walletState, connected: true, balance: 12.5 }
    renderInput()
    expect(screen.getByText(/Balance: 12\.5 XRP/)).toBeTruthy()
  })

  it('shows the MPC-signed message for a family with no wallet adapter (advisory address, no available wallets)', () => {
    walletState = { ...walletState, connected: false, balance: null, availableWallets: [] }
    renderInput({ walletAddress: 'rSomeDepositAddress' })
    expect(screen.getByText('MPC-signed — no wallet balance')).toBeTruthy()
  })

  it('renders nothing (hidden) when not connected but a wallet adapter is available to prompt', () => {
    walletState = {
      ...walletState,
      connected: false,
      balance: null,
      availableWallets: [{ name: 'Xaman' }],
    }
    renderInput({ walletAddress: 'rSomeDepositAddress' })
    expect(screen.queryByText(/^Balance:/)).toBeNull()
    expect(screen.queryByText(/MPC-signed/)).toBeNull()
  })

  it('readOnly always shows "estimated" regardless of wallet state', () => {
    walletState = { ...walletState, connected: true, balance: 42 }
    renderInput({ readOnly: true })
    expect(screen.getByText('estimated')).toBeTruthy()
    expect(screen.queryByText(/Balance:/)).toBeNull()
  })
})

describe('AssetInput — MAX button', () => {
  it('fills the input with the full balance when clicked', () => {
    walletState = { ...walletState, connected: true, balance: 12.5 }
    const { onAmountChange } = renderInput({ showMax: true })
    fireEvent.click(screen.getByRole('button', { name: 'Max' }))
    expect(onAmountChange).toHaveBeenCalledWith('12.5')
  })

  it('is a no-op when the resolved balance is zero, even though the button renders', () => {
    walletState = { ...walletState, connected: true, balance: 0 }
    const { onAmountChange } = renderInput({ showMax: true })
    // balanceState is still "amount" (0 !== null) so the button shows —
    // onMax's own balance<=0 guard is what must stop it, not visibility.
    fireEvent.click(screen.getByRole('button', { name: 'Max' }))
    expect(onAmountChange).not.toHaveBeenCalled()
  })

  it('does not render when showMax is false', () => {
    walletState = { ...walletState, connected: true, balance: 12.5 }
    renderInput({ showMax: false })
    expect(screen.queryByRole('button', { name: 'Max' })).toBeNull()
  })
})

describe('AssetInput — amount input', () => {
  it('passes through valid amounts, including partial decimals', () => {
    const { onAmountChange } = renderInput()
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '12.' } })
    expect(onAmountChange).toHaveBeenCalledWith('12.')
  })

  it('passes through an empty string (clearing the field)', () => {
    const { onAmountChange } = renderInput({ amount: '5' })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
    expect(onAmountChange).toHaveBeenCalledWith('')
  })

  it('rejects an unparseable amount', () => {
    const { onAmountChange } = renderInput()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '12.5.6' } })
    expect(onAmountChange).not.toHaveBeenCalled()
  })

  it('rejects a negative amount', () => {
    const { onAmountChange } = renderInput()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '-5' } })
    expect(onAmountChange).not.toHaveBeenCalled()
  })
})

describe('AssetInput — asset picker', () => {
  it('calls onAssetChange with the selected asset', () => {
    const { onAssetChange } = renderInput()
    fireEvent.click(screen.getByRole('button', { name: /XRP/ }))
    fireEvent.click(screen.getByRole('option', { name: /SOL/ }))
    expect(onAssetChange).toHaveBeenCalledWith(sol)
  })
})
