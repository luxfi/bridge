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

export interface WalletState {
  /** Connected EOA address, or null when disconnected. */
  address: string | null
  /** Bridge-internal chain id (`evm:1`), or null when disconnected. */
  chainId: string | null
  /** True while a connect handshake is in flight. */
  connecting: boolean
  /** True while a sign request is in flight. */
  signing: boolean
  /** Connect to the wallet, targeting the given bridge chain id. */
  connect: (chainId: string) => Promise<void>
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

  // Connector preference: explicit WalletConnect (when configured) → injected
  // (MetaMask/Rabby/etc) → Coinbase Wallet → first available. Tenants can
  // override by composing their own wagmi config, but the SDK default picks
  // the user-friendliest connector at hand.
  const pickConnector = useCallback(() => {
    return (
      connectors.find((c) => c.id === 'walletConnect') ??
      connectors.find((c) => c.id === 'injected') ??
      connectors.find((c) => c.id === 'coinbaseWalletSDK') ??
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
    connect,
    disconnect,
    switchChain,
    signMessage,
  }
}
