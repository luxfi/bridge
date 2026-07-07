// BridgeApp — top-level inlined bridge UI for @luxfi/bridge.
//
// Previously this code shipped in the separate `@luxbridge/app` workspace
// package, which created a runtime cycle: `@luxfi/bridge` lazy-imported
// `@luxbridge/app`, and tenant repos (notably Phase 2's slimmed `app/bridge`)
// then stubbed `@luxbridge/app` to a no-op `App` component to break the
// build cycle — producing the blank-page bug Phase 1.5 fixes by inlining
// here.
//
// Phase 3 R3 wraps the inner tree in `<WagmiProvider>` + `<QueryClientProvider>`
// so the wallet hooks have a wagmi context. The Config is built from
// `BridgeConfig.wallet` and is stable for the lifetime of this mount.
//
// Design notes:
//   - No central authority. Chain + asset lists are static client-side data
//     today; in production the bridge backend serves them, but the trust
//     model is the same — the user signs every transfer via threshold MPC.
//   - PQ-safe. The signing layer uses Ringtail-lattice + ECDSA-CMP hybrid;
//     nothing in this file makes a classical-only assumption. Wagmi handles
//     the user leg (classical secp256k1); MPC handles the bridge leg (any
//     protocol cfg.mpc.protocol specifies).
//   - Tamagui swap. Phase 3 R2 replaces inline styles + native `<select>`
//     with `@hanzo/gui` primitives. This file's shape is stable across
//     that swap — the components in `./components/` are the seams.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useMemo, type FC } from 'react'
import { WagmiProvider } from 'wagmi'

import { getConfig } from '../config'
import { Header } from './components/Header'
import { SwapForm } from './components/SwapForm'
import { TransferStatus } from './components/TransferStatus'
import { useSwap } from './hooks/useSwap'
import { useTransfers } from './hooks/useTransfers'
import { useBridgeWallet } from './hooks/useBridgeWallet'
import { buildWagmiConfig } from './lib/wagmi-config'

import './styles/theme.css'

const shell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  background: 'var(--bridge-bg)',
  color: 'var(--bridge-text)',
}

const main: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
  padding: 'var(--bridge-page-padding-y) var(--bridge-page-padding-x)',
}

const stack: React.CSSProperties = {
  width: '100%',
  maxWidth: 'var(--bridge-stack-max-width)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bridge-stack-gap)',
}

const footer: React.CSSProperties = {
  textAlign: 'center',
  padding: '20px 16px',
  fontSize: 11,
  color: 'var(--bridge-text-subtle)',
  borderTop: '1px solid var(--bridge-border)',
}

/**
 * Inner BridgeApp tree — runs *inside* WagmiProvider so the wallet hooks
 * have a wagmi context to read.
 */
const BridgeAppInner: FC = () => {
  const cfg = getConfig()

  // Unified wallet across all six ecosystems: wagmi for the EVM/Lux deposit
  // leg, @luxwallet/connect for Solana / Bitcoin / TON / XRP / Polkadot.
  // The TON connector needs a dApp manifest URL; serve it same-origin so the
  // TON Connect identity card shows this tenant. Falls back to the connect
  // SDK's default if the URL can't be built.
  const tonManifestUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/tonconnect-manifest.json`
    }
    try {
      return new URL('/tonconnect-manifest.json', cfg.apiHost).toString()
    } catch {
      return undefined
    }
  }, [cfg.apiHost])

  const wallet = useBridgeWallet({
    connectorOptions: tonManifestUrl
      ? { ton: { manifestUrl: tonManifestUrl } }
      : {},
  })
  const swap = useSwap()
  const transfers = useTransfers()

  // Document-level theme hint — lets host pages opt in to dark mode without
  // having to mirror our CSS variables.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.add('bridge-theme')
    return () => {
      document.documentElement.classList.remove('bridge-theme')
    }
  }, [])

  const supportEmail = cfg.brand?.supportEmail
  const docsUrl = cfg.brand?.docsUrl
  const env = cfg.env

  return (
    <div className="bridge-root" style={shell}>
      <Header wallet={wallet} fromChain={swap.fromChain} />
      <main style={main}>
        <div style={stack}>
          <SwapForm swap={swap} wallet={wallet} transfers={transfers} />
          <TransferStatus transfers={transfers.transfers} />
        </div>
      </main>
      <footer style={footer}>
        <span>Network: {env}</span>
        {docsUrl ? (
          <>
            {' · '}
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--bridge-text-muted)' }}
            >
              Docs
            </a>
          </>
        ) : null}
        {supportEmail ? (
          <>
            {' · '}
            <a
              href={`mailto:${supportEmail}`}
              style={{ color: 'var(--bridge-text-muted)' }}
            >
              {supportEmail}
            </a>
          </>
        ) : null}
      </footer>
    </div>
  )
}

export const BridgeApp: FC = () => {
  const cfg = getConfig()

  // Build wagmi config + react-query client once per mount. Both are stable
  // singletons for the lifetime of the BridgeApp instance — wagmi's `Config`
  // is not designed to mutate at runtime; reconfiguring requires unmount.
  const wagmiConfig = useMemo(() => buildWagmiConfig(cfg), [cfg])
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Bridge data (quotes, swaps) is request-scoped and changes fast.
            // Disable refetch-on-mount/focus so we don't surprise the user
            // with a fresh quote after switching tabs.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
    [],
  )

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BridgeAppInner />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default BridgeApp
