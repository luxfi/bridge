// BridgeApp — top-level inlined bridge UI for @luxfi/bridge.
//
// Previously this code shipped in the separate `@luxbridge/app` workspace
// package, which created a runtime cycle: `@luxfi/bridge` lazy-imported
// `@luxbridge/app`, and tenant repos (notably Phase 2's slimmed `app/bridge`)
// then stubbed `@luxbridge/app` to a no-op `App` component to break the
// build cycle — producing the blank-page bug Phase 1.5 fixes by inlining
// here.
//
// Design notes:
//   - No central authority. Chain + asset lists are static client-side data
//     today; in production the bridge backend serves them, but the trust
//     model is the same — the user signs every transfer via threshold MPC.
//   - PQ-safe. The signing layer (wired by Phase 3 R3) uses Ringtail-lattice
//     + ECDSA-CMP hybrid; nothing in this file makes a classical-only
//     assumption.
//   - Tamagui swap. Phase 3 R2 replaced inline `<button>`/`<input>` with
//     `@hanzo/gui`'s Button + Input; Phase 3 R2.5 rotates the layout +
//     text primitives (Card/XStack/YStack/Text). The components in
//     `./components/` are the seams.

import { useEffect, type FC } from 'react'
import { Text, XStack, YStack } from '@hanzo/gui'

import { getConfig } from '../config'
import { Header } from './components/Header'
import { SwapForm } from './components/SwapForm'
import { TransferStatus } from './components/TransferStatus'
import { useSwap } from './hooks/useSwap'
import { useTransfers } from './hooks/useTransfers'
import { useWallet } from './hooks/useWallet'

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
  padding: '32px 16px',
}

const stack: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const footer: React.CSSProperties = {
  textAlign: 'center',
  padding: '20px 16px',
  fontSize: 11,
  color: 'var(--bridge-text-subtle)',
  borderTop: '1px solid var(--bridge-border)',
}

export const BridgeApp: FC = () => {
  // Read SDK config — Bridge.tsx guarantees setConfig() ran first.
  const cfg = getConfig()

  const wallet = useWallet()
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
    <YStack className="bridge-root" style={shell}>
      <Header wallet={wallet} defaultChainId={swap.fromChain.id} />
      <XStack render="main" style={main}>
        <YStack style={stack}>
          <SwapForm swap={swap} wallet={wallet} transfers={transfers} />
          <TransferStatus transfers={transfers.transfers} />
        </YStack>
      </XStack>
      <XStack
        render="footer"
        style={footer}
        justifyContent="center"
        alignItems="center"
        flexWrap="wrap"
      >
        <Text>Network: {env}</Text>
        {docsUrl ? (
          <>
            <Text>{' · '}</Text>
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
            <Text>{' · '}</Text>
            <a
              href={`mailto:${supportEmail}`}
              style={{ color: 'var(--bridge-text-muted)' }}
            >
              {supportEmail}
            </a>
          </>
        ) : null}
      </XStack>
    </YStack>
  )
}

export default BridgeApp
