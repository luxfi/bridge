// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// SwapForm is the primary bridge UI and owns real business logic that
// had never been tested: the submit-gating conditions and their
// user-facing label text, the destination-address fallback chain
// (typed input > same-family connected wallet > cross-family
// destination wallet > empty), and -- the one most worth getting
// exactly right -- the XRP destination-tag parser, which is a genuine
// three-state value (omitted / invalid / a specific number) baked
// directly into the payload sent to the backend. Getting any of these
// wrong either blocks a valid swap or lets an invalid one through.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import type { Asset } from '../app/lib/assets'
import type { Chain } from '../app/lib/chains'
import type { Quote, SwapState } from '../app/hooks/useSwap'
import type { WalletState } from '../app/hooks/useWallet'
import type { TransferState } from '../app/hooks/useTransfers'

vi.mock('@hanzo/gui', () => ({
  Button: (props: {
    children?: ReactNode
    disabled?: boolean
    onClick?: () => void
    style?: unknown
  }) => (
    <button disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  ),
  // AssetInput (rendered for real inside SwapForm) uses this. Same
  // plain-<input> mock as AssetInput.test.tsx, for the same reason:
  // it's a styled(View,...) cross-platform primitive with no test
  // precedent for rendering cleanly under happy-dom.
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

let mockConfig: { apiHost: string; mpc?: { utila?: object; fireblocks?: object } } = {
  apiHost: 'https://api.example.test',
}
vi.mock('../config', () => ({
  getConfig: () => mockConfig,
}))

let mockDestWallet: { address: string | null } = { address: null }
vi.mock('../app/lib/wallet-adapters', () => ({
  useWalletForFamily: () => ({
    family: 'ton',
    address: mockDestWallet.address,
    connected: mockDestWallet.address !== null,
    connecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    balance: null,
    balanceSymbol: null,
    balanceLoading: false,
    availableWallets: [],
  }),
  // AssetInput (rendered for real inside SwapForm) calls this to show a
  // balance. Not the focus of these tests -- a fixed "nothing connected,
  // no balance" shape keeps AssetInput rendering without needing its
  // own dedicated fixture here.
  useWalletForBridgeId: () => ({
    family: 'evm',
    address: null,
    connected: false,
    connecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    balance: null,
    balanceSymbol: null,
    balanceLoading: false,
    availableWallets: [],
  }),
}))

import { SwapForm } from '../app/components/SwapForm'

function chain(overrides: Partial<Chain>): Chain {
  return {
    id: 'evm:11155111',
    internalName: 'ETHEREUM_SEPOLIA',
    name: 'Sepolia',
    symbol: 'ETH',
    decimals: 18,
    family: 'evm',
    ...overrides,
  }
}
function asset(overrides: Partial<Asset>): Asset {
  return {
    id: 'evm:11155111:ETH',
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: 'evm:11155111',
    decimals: 18,
    ...overrides,
  }
}

const ethChain = chain({ id: 'evm:11155111', name: 'Sepolia', family: 'evm' })
const tonChain = chain({ id: 'ton:testnet', name: 'TON Testnet', symbol: 'TON', family: 'ton' })
const xrpChain = chain({ id: 'xrp:testnet', name: 'XRP Testnet', symbol: 'XRP', family: 'xrp' })
const ethAsset = asset({ id: 'evm:11155111:ETH', symbol: 'ETH', chainId: 'evm:11155111' })
const tonAsset = asset({ id: 'ton:testnet:TON', symbol: 'TON', chainId: 'ton:testnet' })
const xrpAsset = asset({ id: 'xrp:testnet:XRP', symbol: 'XRP', chainId: 'xrp:testnet' })

const quote: Quote = { outAmount: 0.98, feeUsd: 1.5, destGas: 0, etaText: '~5min', rate: 0.98, minOut: 0.97 }

function baseSwap(overrides: Partial<SwapState> = {}): SwapState {
  return {
    chains: [ethChain, tonChain, xrpChain],
    assets: [ethAsset, tonAsset, xrpAsset],
    fromChain: ethChain,
    toChain: tonChain,
    fromAsset: ethAsset,
    toAsset: tonAsset,
    amount: '1',
    quote,
    quoting: false,
    quoteError: null,
    refuel: false,
    networksLoading: false,
    setFromChain: vi.fn(),
    setToChain: vi.fn(),
    setFromAsset: vi.fn(),
    setToAsset: vi.fn(),
    setAmount: vi.fn(),
    setRefuel: vi.fn(),
    reverse: vi.fn(),
    fromAssetOptions: [ethAsset],
    toAssetOptions: [tonAsset],
    ...overrides,
  }
}
function baseWallet(overrides: Partial<WalletState> = {}): WalletState {
  return {
    address: '0xConnectedWallet00000000000000000000000000',
    chainId: 'evm:11155111',
    connecting: false,
    signing: false,
    connectors: [],
    connect: vi.fn(),
    connectWith: vi.fn(),
    disconnect: vi.fn(),
    signMessage: vi.fn(),
    switchChain: vi.fn(),
    ...overrides,
  }
}
// SwapForm calls transfers.submit() -- a back-compat alias for
// `initiate` (see useTransfers.ts: "SwapForm calls submit() today").
// Wire both to the SAME mock by default so a test overriding either
// name still observes calls made through whichever one the component
// actually uses.
function baseTransfers(overrides: Partial<TransferState> = {}): TransferState {
  const fn = (overrides.submit ?? overrides.initiate ?? vi.fn()) as TransferState['initiate']
  return {
    transfers: [],
    active: null,
    initiate: fn,
    submit: fn,
    ...overrides,
  } as unknown as TransferState
}

beforeEach(() => {
  mockConfig = { apiHost: 'https://api.example.test' }
  // Default: the destination-family wallet IS connected, since the
  // default fixture's toChain (TON) is cross-family from fromChain
  // (EVM) -- destFamilyFallback only reads wallet.address for a
  // same-family (or EVM-to-EVM/Lux) destination, so most "happy path"
  // tests need this set to reach an enabled/submittable state. Tests
  // specifically covering "no destination wallet connected" override
  // it back to null.
  mockDestWallet = { address: 'EQDestinationTonWalletAddress' }
})

describe('SwapForm — submit gating + label', () => {
  it('is enabled with a quote, differing chains, and a connected EVM wallet', () => {
    render(<SwapForm swap={baseSwap()} wallet={baseWallet()} transfers={baseTransfers()} />)
    expect((screen.getByRole('button', { name: /Bridge ETH → TON/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('is disabled and explains when source and destination chains are the same', () => {
    render(
      <SwapForm
        swap={baseSwap({ toChain: ethChain, toAsset: ethAsset })}
        wallet={baseWallet()}
        transfers={baseTransfers()}
      />,
    )
    expect((screen.getByRole('button', { name: 'Source and destination must differ' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('is disabled while quoting', () => {
    render(
      <SwapForm swap={baseSwap({ quoting: true, quote: null })} wallet={baseWallet()} transfers={baseTransfers()} />,
    )
    expect((screen.getByRole('button', { name: 'Fetching quote…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('is disabled with no quote yet', () => {
    render(<SwapForm swap={baseSwap({ quote: null })} wallet={baseWallet()} transfers={baseTransfers()} />)
    expect((screen.getByRole('button', { name: 'Enter an amount' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('is disabled for an EVM source with no connected wallet', () => {
    render(
      <SwapForm swap={baseSwap()} wallet={baseWallet({ address: null })} transfers={baseTransfers()} />,
    )
    expect((screen.getByRole('button', { name: 'Connect Sepolia wallet to sign deposit' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does NOT require a connected wallet for a non-EVM source', () => {
    mockDestWallet = { address: 'EQDestinationTonWalletAddress' }
    render(
      <SwapForm
        swap={baseSwap({ fromChain: tonChain, fromAsset: tonAsset, toChain: ethChain, toAsset: ethAsset })}
        wallet={baseWallet({ address: null })}
        transfers={baseTransfers()}
      />,
    )
    expect((screen.getByRole('button', { name: /Bridge TON → ETH/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('is disabled when no destination address can be resolved (cross-family, no wallets)', () => {
    mockDestWallet = { address: null }
    render(
      <SwapForm
        swap={baseSwap({ toChain: xrpChain, toAsset: xrpAsset })}
        wallet={baseWallet()}
        transfers={baseTransfers()}
      />,
    )
    expect((screen.getByRole('button', { name: 'Enter XRP Testnet destination address' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SwapForm — destination address resolution', () => {
  it('auto-fills from the connected source wallet for a same-family destination', () => {
    render(
      <SwapForm
        swap={baseSwap({ toChain: chain({ id: 'evm:1', name: 'Ethereum', family: 'evm' }) })}
        wallet={baseWallet({ address: '0xConnectedWallet00000000000000000000000000' })}
        transfers={baseTransfers()}
      />,
    )
    expect(screen.getByPlaceholderText(/0xConn…0000/)).toBeTruthy()
  })

  it('auto-fills from the destination-family wallet for a cross-family destination', () => {
    mockDestWallet = { address: 'EQDestinationTonWalletAddress' }
    render(<SwapForm swap={baseSwap()} wallet={baseWallet()} transfers={baseTransfers()} />)
    expect(screen.getByPlaceholderText(/EQDest…ress/)).toBeTruthy()
  })

  it('prefers a manually-typed address over the wallet fallback', () => {
    mockDestWallet = { address: 'EQDestinationTonWalletAddress' }
    const initiate = vi.fn()
    render(
      <SwapForm swap={baseSwap()} wallet={baseWallet()} transfers={baseTransfers({ initiate })} />,
    )
    fireEvent.change(screen.getByLabelText('Destination address'), {
      target: { value: 'EQManuallyTypedAddress' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Bridge ETH → TON/ }))
    expect(initiate).toHaveBeenCalledWith(
      expect.objectContaining({ destinationAddress: 'EQManuallyTypedAddress' }),
    )
  })

  it('clears the typed destination when the destination chain FAMILY changes', () => {
    const { rerender } = render(
      <SwapForm swap={baseSwap()} wallet={baseWallet()} transfers={baseTransfers()} />,
    )
    fireEvent.change(screen.getByLabelText('Destination address'), {
      target: { value: 'EQManuallyTypedAddress' },
    })
    expect((screen.getByLabelText('Destination address') as HTMLInputElement).value).toBe('EQManuallyTypedAddress')

    rerender(
      <SwapForm
        swap={baseSwap({ toChain: xrpChain, toAsset: xrpAsset })}
        wallet={baseWallet()}
        transfers={baseTransfers()}
      />,
    )
    expect((screen.getByLabelText('Destination address') as HTMLInputElement).value).toBe('')
  })
})

describe('SwapForm — XRP destination tag', () => {
  function renderXrp(transfers = baseTransfers()) {
    return render(
      <SwapForm
        swap={baseSwap({ toChain: xrpChain, toAsset: xrpAsset })}
        wallet={baseWallet()}
        transfers={transfers}
      />,
    )
  }

  it('does not render a tag field for a non-XRP destination', () => {
    render(<SwapForm swap={baseSwap()} wallet={baseWallet()} transfers={baseTransfers()} />)
    expect(screen.queryByLabelText('XRPL destination tag')).toBeNull()
  })

  it('omits destinationTag entirely when left blank', () => {
    const initiate = vi.fn()
    renderXrp(baseTransfers({ initiate }))
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: 'rSomeXrpAddress' } })
    fireEvent.click(screen.getByRole('button', { name: /Bridge ETH → XRP/ }))
    expect(initiate).toHaveBeenCalledTimes(1)
    const payload = initiate.mock.calls[0][0]
    expect('destinationTag' in payload).toBe(false)
  })

  it('includes destinationTag as a number when a valid tag is entered', () => {
    const initiate = vi.fn()
    renderXrp(baseTransfers({ initiate }))
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: 'rSomeXrpAddress' } })
    fireEvent.change(screen.getByLabelText('XRPL destination tag'), { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: /Bridge ETH → XRP/ }))
    expect(initiate).toHaveBeenCalledWith(expect.objectContaining({ destinationTag: 12345 }))
  })

  it('blocks submission with a specific error for a non-numeric tag', () => {
    const initiate = vi.fn()
    renderXrp(baseTransfers({ initiate }))
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: 'rSomeXrpAddress' } })
    fireEvent.change(screen.getByLabelText('XRPL destination tag'), { target: { value: 'not-a-number' } })
    fireEvent.click(screen.getByRole('button', { name: /Bridge ETH → XRP/ }))
    expect(initiate).not.toHaveBeenCalled()
    expect(
      screen.getByText('Destination tag must be a whole number between 0 and 4294967295.'),
    ).toBeTruthy()
  })

  it('blocks submission for a tag exceeding uint32 max', () => {
    const initiate = vi.fn()
    renderXrp(baseTransfers({ initiate }))
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: 'rSomeXrpAddress' } })
    fireEvent.change(screen.getByLabelText('XRPL destination tag'), { target: { value: '4294967296' } }) // 2^32
    fireEvent.click(screen.getByRole('button', { name: /Bridge ETH → XRP/ }))
    expect(initiate).not.toHaveBeenCalled()
  })

  it('accepts the exact uint32 boundary value 4294967295', () => {
    const initiate = vi.fn()
    renderXrp(baseTransfers({ initiate }))
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: 'rSomeXrpAddress' } })
    fireEvent.change(screen.getByLabelText('XRPL destination tag'), { target: { value: '4294967295' } })
    fireEvent.click(screen.getByRole('button', { name: /Bridge ETH → XRP/ }))
    expect(initiate).toHaveBeenCalledWith(expect.objectContaining({ destinationTag: 4294967295 }))
  })
})

describe('SwapForm — submit payload + side effects', () => {
  it('submits the full expected payload and clears the amount field after success', () => {
    // Same-family (EVM->EVM) destination here deliberately, so
    // destinationAddress ties directly to wallet.address -- keeps this
    // test about payload-shape correctness, decoupled from the
    // cross-family fallback nuance the "destination address
    // resolution" describe block above already covers on its own.
    const evmDest = chain({ id: 'evm:1', name: 'Ethereum', family: 'evm' })
    const evmDestAsset = asset({ id: 'evm:1:ETH', symbol: 'ETH', chainId: 'evm:1' })
    const initiate = vi.fn()
    const setAmount = vi.fn()
    render(
      <SwapForm
        swap={baseSwap({ toChain: evmDest, toAsset: evmDestAsset, setAmount, amount: '2.5' })}
        wallet={baseWallet()}
        transfers={baseTransfers({ initiate })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Bridge ETH → ETH/ }))
    expect(initiate).toHaveBeenCalledWith({
      fromChainId: ethChain.id,
      toChainId: evmDest.id,
      fromAssetId: ethAsset.id,
      toAssetId: evmDestAsset.id,
      inAmount: 2.5,
      outAmount: quote.outAmount,
      refuel: false,
      destinationAddress: '0xConnectedWallet00000000000000000000000000',
      useDepositAddress: true,
    })
    expect(setAmount).toHaveBeenCalledWith('')
  })

  it('reverse button calls swap.reverse', () => {
    const reverse = vi.fn()
    render(<SwapForm swap={baseSwap({ reverse })} wallet={baseWallet()} transfers={baseTransfers()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Swap from and to chains' }))
    expect(reverse).toHaveBeenCalledTimes(1)
  })

  it('shows the 2-of-2 cosigner notice only when a layered cosigner is configured', () => {
    const { rerender } = render(
      <SwapForm swap={baseSwap()} wallet={baseWallet()} transfers={baseTransfers()} />,
    )
    expect(screen.queryByText('2-of-2')).toBeNull()

    mockConfig = { apiHost: 'https://api.example.test', mpc: { fireblocks: {} } }
    rerender(<SwapForm swap={baseSwap()} wallet={baseWallet()} transfers={baseTransfers()} />)
    expect(screen.getByText('2-of-2')).toBeTruthy()
  })
})
