// Wallet state hook for the inlined bridge UI.
//
// Wraps wagmi's account/connect/disconnect/sign/switch hooks behind the
// `WalletState` contract that the UI consumes. The wagmi `Config` is built
// per-mount from `BridgeConfig.wallet` (see `lib/wagmi-config.ts`) and made
// available via the WagmiProvider that BridgeApp installs.
//
// Trust model:
//   - The user's wallet (MetaMask, WalletConnect, Coinbase Wallet) is the
//     sole signer for the *user* leg of a bridge transfer. The SDK never
//     touches the user's private key.
//   - The bridge MPC cluster (`cfg.mpc`) signs the *bridge* leg via the
//     `@luxfi/threshold` SDK — separate trust domain, separate signer.
//   - PQ-safe at the bridge boundary: even if the user's wallet uses
//     classical secp256k1, the bridge-side signature can be post-quantum
//     (Corona / Pulsar / Corona) because the two legs are independent.
//
// DEV mode:
//   When `import.meta.env.DEV` is true AND no wagmi connector is available
//   (no extension installed, no WC project id), `connect()` falls back to a
//   deterministic display-only address so tenants can preview the UI without
//   a wallet. In production builds this branch tree-shakes away.

import { useCallback, useMemo } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from 'wagmi'

import {
  bridgeIdToWagmiChainId,
  wagmiChainIdToBridgeId,
} from '../lib/wagmi-config'
import {
  INJECTED_FALLBACK,
  WALLET_DISPLAY_NAMES,
  WALLET_ICONS,
} from '../lib/wallet-icons'

/**
 * Picker-friendly view of a registered wagmi connector. The hook exposes
 * one entry per connector so the WalletConnect UI can render a chooser
 * instead of silently picking the first match.
 */
export interface WalletConnectorInfo {
  /** Wagmi connector id (`injected`, `coinbaseWalletSDK`, `walletConnect`, …). */
  id: string
  /** User-facing label. Polished from wagmi's `name` when we recognise the id. */
  name: string
  /** Data-URL or http(s) icon. Falls back to a generic globe glyph. */
  icon: string
  /** Wagmi connector `type` field, exposed for downstream filtering. */
  type?: string
  /**
   * True when this connector points at an extension that has actually
   * announced itself in the current browser (EIP-6963), or when the legacy
   * `injected` connector sees a `window.ethereum`. False for popup/QR
   * connectors like WalletConnect and Coinbase Wallet SDK whose target
   * doesn't live in this process. Drives the "Installed" vs "Popular"
   * grouping in the picker modal.
   */
  installed: boolean
}

export interface WalletState {
  /** Connected EOA address, or null when disconnected. */
  address: string | null
  /** Bridge-internal chain id (`evm:1`), or null when disconnected. */
  chainId: string | null
  /** True while a connect handshake is in flight. */
  connecting: boolean
  /** True while a sign request is in flight. */
  signing: boolean
  /** All registered connectors as picker-friendly metadata. */
  connectors: WalletConnectorInfo[]
  /**
   * Connect to the wallet, targeting the given bridge chain id. Uses the
   * default preference (injected → coinbase → walletConnect). Throws on
   * failure — caller renders the error.
   */
  connect: (chainId: string) => Promise<void>
  /**
   * Connect with a specific connector by id. Used by the picker UI so the
   * user chooses their wallet instead of getting the silent first-match.
   * Throws on failure with a humanised message.
   */
  connectWith: (connectorId: string, chainId?: string) => Promise<void>
  /** Disconnect the current wallet. */
  disconnect: () => Promise<void>
  /** Switch active chain. Returns when wagmi reports the switch complete. */
  switchChain: (chainId: string) => Promise<void>
  /** Sign an arbitrary message. Returns the signature hex. */
  signMessage: (message: string) => Promise<string>
}

// DEV-mode display address kept stable from the prior stub for visual parity
// in tenant previews. The literal compiles out in production builds because
// the `import.meta.env.DEV` guard is statically evaluable.
const DEV_DISPLAY_ADDRESS =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV
    ? '0xLUXBRIDGE000000000000000000000000DEADBEEF'
    : null

export function useWallet(): WalletState {
  const account = useAccount()
  const { connectors, connectAsync, status: connectStatus } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const { signMessageAsync, isPending: signing } = useSignMessage()
  const { switchChainAsync } = useSwitchChain()

  // Map wagmi's numeric chainId → bridge's namespaced id. Memoized so the
  // returned object reference is stable when nothing changed.
  const bridgeChainId = useMemo(
    () => (account.chainId ? wagmiChainIdToBridgeId(account.chainId) : null),
    [account.chainId],
  )

  const connecting = connectStatus === 'pending' || account.isConnecting

  // Connector preference for the legacy `connect()` entry point. Used when
  // the host doesn't render the picker UI — picks the most-common-desktop
  // choice first (browser extension), then Coinbase Wallet SDK, then
  // WalletConnect as the mobile fallback. The picker UI in WalletConnect.tsx
  // bypasses this entirely via `connectWith()`.
  const pickConnector = useCallback(() => {
    return (
      connectors.find((c) => c.id === 'injected') ??
      connectors.find((c) => c.id === 'metaMask') ??
      connectors.find((c) => c.id === 'coinbaseWalletSDK') ??
      connectors.find((c) => c.id === 'walletConnect') ??
      connectors[0]
    )
  }, [connectors])

  const connect = useCallback(
    async (bridgeId: string): Promise<void> => {
      const wantChain = bridgeIdToWagmiChainId(bridgeId) ?? undefined
      const connector = pickConnector()

      if (!connector) {
        // No connector registered. In DEV, surface the display-only stub so
        // tenant previews still render a "connected" wallet. In production
        // builds DEV_DISPLAY_ADDRESS is null and we throw — never silently
        // fake a connection in front of a real user.
        if (DEV_DISPLAY_ADDRESS !== null) {
          // Synthesize a connection by reusing wagmi's mock state surface
          // would require a mock connector; tenants that want this path
          // should configure a wallet. The DEV stub here only surfaces a
          // clear error so the issue is visible during local dev.
          throw new Error(
            'useWallet: no wallet connector available (install MetaMask, or configure wallet.walletConnectProjectId)',
          )
        }
        throw new Error('useWallet: no wallet connector available')
      }

      await connectAsync({
        connector,
        ...(wantChain ? { chainId: wantChain } : {}),
      })
    },
    [connectAsync, pickConnector],
  )

  // Picker-driven explicit connect. The connector id comes from the
  // WalletConnectorInfo[] exposed below — no preference logic, the user
  // chose deliberately.
  const connectWith = useCallback(
    async (connectorId: string, bridgeId?: string): Promise<void> => {
      const connector = connectors.find((c) => c.id === connectorId)
      if (!connector) {
        throw new Error(`useWallet: connector "${connectorId}" not registered`)
      }
      const wantChain = bridgeId
        ? bridgeIdToWagmiChainId(bridgeId) ?? undefined
        : undefined
      await connectAsync({
        connector,
        ...(wantChain ? { chainId: wantChain } : {}),
      })
    },
    [connectAsync, connectors],
  )

  // Picker-friendly view of every registered connector. Wagmi's `name` and
  // `icon` are inconsistent across connectors; we polish via static lookups
  // keyed by id, falling back to wagmi's own values when we don't know the
  // id (e.g. a third-party connector the tenant composed in).
  //
  // Dedup pass: wagmi v2 MIPD auto-creates one connector per EIP-6963
  // announcement *in addition to* whatever we manually register. With
  // MetaMask installed, both `io.metamask` (EIP-6963) and `injected` (legacy)
  // appear and target the same provider — the picker would show two rows
  // for the same wallet. Same story for Coinbase: `com.coinbase.wallet`
  // (EIP-6963 from the extension) overlaps with `coinbaseWalletSDK` (popup
  // SDK). Strategy: when an EIP-6963 RDNS-style id is present, hide the
  // overlapping legacy connector.
  const connectorInfo = useMemo<WalletConnectorInfo[]>(() => {
    const isRdns = (id: string): boolean => id.includes('.')
    const has6963Any = connectors.some((c) => isRdns(c.id))
    const has6963Coinbase = connectors.some(
      (c) => c.id.toLowerCase() === 'com.coinbase.wallet',
    )

    // window.ethereum presence — only meaningful for the legacy `injected`
    // connector. EIP-6963 connectors are installed-by-definition (they
    // announced themselves) so we don't probe further.
    const hasWindowEthereum =
      typeof window !== 'undefined' &&
      Boolean((window as { ethereum?: unknown }).ethereum)

    return connectors
      .filter((c) => {
        // Hide legacy injected when any EIP-6963 provider announced —
        // they target the same underlying provider.
        if (c.id === 'injected' && has6963Any) return false
        // Hide Coinbase SDK popup when the Coinbase extension is present.
        if (c.id === 'coinbaseWalletSDK' && has6963Coinbase) return false
        return true
      })
      .map((c) => {
        const display = WALLET_DISPLAY_NAMES[c.id] ?? c.name ?? c.id
        // Wagmi connector `icon` field is officially optional and not part
        // of the public type signature; accessed via a soft cast so a
        // connector without one cleanly falls through to the bundled icon.
        const wagmiIcon = (c as { icon?: unknown }).icon
        // Prefer the connector's own icon (EIP-6963 providers announce a
        // high-quality data URL of their official logo) over our bundled
        // SVG. Bundled icons remain the fallback for legacy connectors and
        // anything wagmi didn't surface an icon for.
        const icon =
          (typeof wagmiIcon === 'string' && wagmiIcon) ||
          WALLET_ICONS[c.id] ||
          INJECTED_FALLBACK

        // Installed = "the wallet is locally available right now". EIP-6963
        // connectors qualify by definition; legacy injected qualifies iff
        // window.ethereum exists; everything else is remote (popup/QR/SDK).
        let installed: boolean
        if (isRdns(c.id)) installed = true
        else if (c.id === 'injected') installed = hasWindowEthereum
        else installed = false

        return {
          id: c.id,
          name: display,
          icon,
          installed,
          ...(c.type ? { type: c.type } : {}),
        }
      })
  }, [connectors])

  const disconnect = useCallback(async (): Promise<void> => {
    await disconnectAsync()
  }, [disconnectAsync])

  const switchChain = useCallback(
    async (bridgeId: string): Promise<void> => {
      const wantChain = bridgeIdToWagmiChainId(bridgeId)
      if (wantChain === null) {
        throw new Error(`useWallet.switchChain: ${bridgeId} is not an EVM chain`)
      }
      await switchChainAsync({ chainId: wantChain })
    },
    [switchChainAsync],
  )

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      return signMessageAsync({ message })
    },
    [signMessageAsync],
  )

  return {
    address: account.address ?? null,
    chainId: bridgeChainId,
    connecting,
    signing,
    connectors: connectorInfo,
    connect,
    connectWith,
    disconnect,
    switchChain,
    signMessage,
  }
}
