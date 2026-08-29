// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// TransferStatus renders the live transfer feed — phase banners, the
// deposit-address panel, MPC session detail, and layered-cosigner
// badges. It had zero test coverage despite being the surface a user
// stares at while their money is mid-flight; the conditional logic for
// which banner shows for which phase (lastError vs refunding vs
// refunded vs terminal error) is exactly the kind of thing that's easy
// to get subtly wrong in a way that only shows up as "why does this
// say refunding when it already refunded."
//
// useNetworks and getConfig are mocked (both do real work — react-query
// + a mountBridge-gated singleton — that this component's own logic
// doesn't need exercised). Card is rendered for real: it's a 37-line
// style wrapper with zero logic, no reason to mock it.

import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Chain } from '../app/lib/chains'
import type { BridgeConfig } from '../config'

let mockChains: Chain[] = []
let mockConfig: Partial<BridgeConfig> = {}

vi.mock('../config', () => ({
  getConfig: () => mockConfig,
}))

vi.mock('../app/hooks/useNetworks', () => ({
  useNetworks: () => ({
    chains: mockChains,
    assets: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

import type { Transfer } from '../app/hooks/useTransfers'
import { TransferStatus } from '../app/components/TransferStatus'

const luxChain: Chain = {
  id: 'lux:96369',
  internalName: 'LUX_MAINNET',
  name: 'Lux Network',
  symbol: 'LUX',
  decimals: 18,
  family: 'lux',
}
const solChain: Chain = {
  id: 'svm:101',
  internalName: 'SOLANA_MAINNET',
  name: 'Solana',
  symbol: 'SOL',
  decimals: 9,
  family: 'svm',
}

function baseTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 't1',
    fromChainId: 'lux:96369',
    toChainId: 'svm:101',
    fromAssetId: 'lux:96369:LUX',
    toAssetId: 'svm:101:SOL',
    inAmount: 10,
    outAmount: 0.5,
    phase: 'pending',
    createdAt: Date.now(),
    ...overrides,
  }
}

beforeEach(() => {
  mockChains = [luxChain, solChain]
  mockConfig = {}
  vi.restoreAllMocks()
})

describe('TransferStatus — empty + basic row', () => {
  it('shows the empty-state message with no transfers', () => {
    render(<TransferStatus transfers={[]} />)
    expect(screen.getByText(/Nothing yet/)).toBeTruthy()
  })

  it('renders amounts, resolved chain names, and the phase label', () => {
    render(<TransferStatus transfers={[baseTransfer({ phase: 'broadcasting' })]} />)
    expect(screen.getByText('10 → 0.5')).toBeTruthy()
    expect(screen.getByText('Lux Network → Solana')).toBeTruthy()
    expect(screen.getByText('Broadcasting')).toBeTruthy()
  })

  it('falls back to the raw chainId when the chain is not in the registry', () => {
    render(
      <TransferStatus
        transfers={[baseTransfer({ fromChainId: 'unknown:1', toChainId: 'unknown:2' })]}
      />,
    )
    expect(screen.getByText('unknown:1 → unknown:2')).toBeTruthy()
  })
})

describe('TransferStatus — deposit panel', () => {
  it('shows the deposit panel with the address and amount while pending', () => {
    render(
      <TransferStatus
        transfers={[
          baseTransfer({ phase: 'pending', depositAddress: 'rDepositAddressHere', inAmount: 25 }),
        ]}
      />,
    )
    expect(screen.getByText('rDepositAddressHere')).toBeTruthy()
    expect(screen.getByText(/25 on Lux Network/)).toBeTruthy()
  })

  it('hides the deposit panel once completed', () => {
    render(
      <TransferStatus
        transfers={[baseTransfer({ phase: 'completed', depositAddress: 'rDepositAddressHere' })]}
      />,
    )
    expect(screen.queryByText('rDepositAddressHere')).toBeNull()
  })

  it('hides the deposit panel once failed', () => {
    render(
      <TransferStatus
        transfers={[baseTransfer({ phase: 'failed', depositAddress: 'rDepositAddressHere' })]}
      />,
    )
    expect(screen.queryByText('rDepositAddressHere')).toBeNull()
  })

  it('copies the deposit address and shows a transient confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(
      <TransferStatus
        transfers={[baseTransfer({ depositAddress: 'rDepositAddressHere' })]}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Copy' })
    await act(async () => {
      fireEvent.click(btn)
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith('rDepositAddressHere')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  })
})

describe('TransferStatus — MPC session line', () => {
  it('shows protocol, shortened session id, and status', () => {
    render(
      <TransferStatus
        transfers={[
          baseTransfer({
            phase: 'signing',
            mpc: { sessionId: 'sess_abcdef1234567890', status: 'signing', protocol: 'cggmp21' },
          }),
        ]}
      />,
    )
    // The reference support asks for, and where the release has got to.
    // Which protocol the signers ran is not drawn: a person cannot act on it,
    // and it is the one line on this row every visitor reads.
    expect(screen.getByText('Ref sess_a…7890')).toBeTruthy()
    expect(screen.getByText('· signing')).toBeTruthy()
    expect(screen.queryByText(/cggmp21/i)).toBeNull()
  })

  it('shows "session aborted" instead of a truncated id when aborted', () => {
    render(
      <TransferStatus
        transfers={[
          baseTransfer({
            phase: 'failed',
            mpc: { sessionId: 'aborted', status: 'failed', protocol: 'cggmp21', error: 'quorum lost' },
          }),
        ]}
      />,
    )
    expect(screen.getByText('Release cancelled')).toBeTruthy()
    expect(screen.getByText('· quorum lost')).toBeTruthy()
  })
})

describe('TransferStatus — cosigner badges', () => {
  it('renders no badges when no layered cosigner is configured', () => {
    render(<TransferStatus transfers={[baseTransfer()]} />)
    expect(screen.queryByText('Lux')).toBeNull()
  })

  it('renders Native MPC + Utila when utila is configured', () => {
    mockConfig = { mpc: { utila: { vaultId: 'vault-1' } } } as Partial<BridgeConfig>
    render(<TransferStatus transfers={[baseTransfer()]} />)
    expect(screen.getByText('Lux')).toBeTruthy()
    expect(screen.getByText('+ Utila')).toBeTruthy()
    expect(screen.queryByText('+ Fireblocks')).toBeNull()
  })

  it('renders both badges when both cosigners are configured', () => {
    mockConfig = {
      mpc: {
        utila: { vaultId: 'vault-1' },
        fireblocks: { vaultAccountId: 'va-1' },
      },
    } as Partial<BridgeConfig>
    render(<TransferStatus transfers={[baseTransfer()]} />)
    expect(screen.getByText('+ Utila')).toBeTruthy()
    expect(screen.getByText('+ Fireblocks')).toBeTruthy()
  })
})

describe('TransferStatus — phase banners are mutually exclusive per intent', () => {
  it('shows the retrying banner for a transient lastError while still progressing', () => {
    render(
      <TransferStatus
        transfers={[baseTransfer({ phase: 'broadcasting', lastError: 'Insufficient funds in release address' })]}
      />,
    )
    expect(screen.getByText(/Insufficient funds in release address — bridge is retrying/)).toBeTruthy()
  })

  it('suppresses the lastError banner once the transfer reaches a terminal phase', () => {
    render(
      <TransferStatus
        transfers={[baseTransfer({ phase: 'completed', lastError: 'stale error from earlier retry' })]}
      />,
    )
    expect(screen.queryByText(/bridge is retrying/)).toBeNull()
  })

  it('shows the refunding banner', () => {
    render(<TransferStatus transfers={[baseTransfer({ phase: 'refunding' })]} />)
    expect(screen.getByText(/Auto-reverting: destination release couldn't land/)).toBeTruthy()
  })

  it('shows the refunded banner with a shortened tx hash', () => {
    render(
      <TransferStatus
        transfers={[baseTransfer({ phase: 'refunded', refundTxHash: '0xabcdef1234567890abcdef' })]}
      />,
    )
    expect(screen.getByText(/Refunded — source funds returned to sender/)).toBeTruthy()
    expect(screen.getByText(/0xabcd…cdef/)).toBeTruthy()
  })

  it('shows the terminal error message for a failed transfer', () => {
    render(
      <TransferStatus
        transfers={[baseTransfer({ phase: 'failed', error: 'Destination chain rejected the release' })]}
      />,
    )
    expect(screen.getByText('Destination chain rejected the release')).toBeTruthy()
  })
})
