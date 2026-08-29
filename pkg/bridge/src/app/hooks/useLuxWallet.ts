// useLuxWallet — non-EVM wallet connect via @luxwallet/connect.
//
// wagmi (`useWallet`) covers the EVM leg of a bridge transfer and stays the
// signer for EVM-source deposits. But the bridge also lists Solana, Bitcoin,
// TON, XRP and Polkadot sources — chains wagmi CANNOT connect. This hook is
// the connect/identity layer for exactly those ecosystems, built on
// @luxwallet/connect's per-chain connectors.
//
// Scope (deliberately narrow):
//   - connect(family)    → open the wallet, return the account address
//   - disconnect()       → forget the session
//   - login(family, ch)  → SIWx (CAIP-122) connect + sign in one call, for
//                          any host that wants wallet identity (no WalletConnect,
//                          no projectId — pure injected/extension providers)
//
// It does NOT sign the bridge deposit. Every transfer settles through the
// MPC deposit-address flow (`useTransfers`): the user sends from whatever
// wallet they own to a server-minted MPC address. So for non-EVM sources the
// hook's job is connect + (optional) identity, not transaction signing.

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  getConnector,
  loginWithWallet,
  type ConnectorOptions,
  type LoginChallenge,
  type LoginResult,
  type WalletConnector,
} from '@luxwallet/connect'

import type { ChainFamily } from '../lib/chains'
import { familyToLuxChain } from '../lib/wallet-family'

/** Connected non-EVM wallet, keyed by the bridge family that owns it. */
export interface LuxWalletState {
  /** Connected address for the active non-EVM chain, or null. */
  address: string | null
  /** Bridge family of the connected wallet (`svm` | `btc` | …), or null. */
  family: ChainFamily | null
  /** Wallet identifier the connector reported (e.g. `phantom`, `xverse`). */
  walletId: string | null
  /** True while a connect/login handshake is in flight. */
  connecting: boolean
  /**
   * Connect a wallet for the given non-EVM family. Throws if the family has
   * no @luxwallet/connect connector (EVM and Lux, which use wagmi) or the
   * user rejects.
   */
  connect: (family: ChainFamily) => Promise<string>
  /** Disconnect the active non-EVM wallet. */
  disconnect: () => Promise<void>
  /**
   * SIWx login: connect + sign a server-minted CAIP-122 challenge in one
   * call. Returns the signed proof for the host to POST to its verifier.
   */
  login: (family: ChainFamily, challenge: LoginChallenge) => Promise<LoginResult>
}

/**
 * Per-chain connector options. TON needs a dApp manifest URL; the bridge
 * passes its public manifest so TON Connect can render the app identity card.
 * Falls back to @luxwallet/connect's default when unset.
 */
export interface UseLuxWalletOptions {
  connectorOptions?: ConnectorOptions
}

export function useLuxWallet(opts: UseLuxWalletOptions = {}): LuxWalletState {
  const [address, setAddress] = useState<string | null>(null)
  const [family, setFamily] = useState<ChainFamily | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Hold the live connector so disconnect() can forget the right session.
  const activeRef = useRef<WalletConnector | null>(null)
  const connectorOptions = opts.connectorOptions

  const resolveConnector = useCallback(
    async (fam: ChainFamily): Promise<WalletConnector> => {
      const chain = familyToLuxChain(fam)
      if (!chain) {
        throw new Error(
          `useLuxWallet: no wallet connector for family "${fam}" ` +
            '(EVM and Lux go through wagmi)',
        )
      }
      // Awaited: 0.2.x loads a chain's wallet SDK only when that chain is
      // asked for. Statically importing all seven pulled sats-connect,
      // @tonconnect/sdk, @crossmarkio/sdk and @polkadot/util-crypto into
      // every page load — the eager-import shape that blanked the exchange.
      return await getConnector(chain, connectorOptions)
    },
    [connectorOptions],
  )

  const connect = useCallback(
    async (fam: ChainFamily): Promise<string> => {
      const connector = await resolveConnector(fam)
      setConnecting(true)
      try {
        const account = await connector.connect()
        activeRef.current = connector
        setAddress(account.address)
        setFamily(fam)
        setWalletId(account.walletId)
        return account.address
      } catch (err) {
        // Forget any dangling session so the next attempt starts clean.
        await connector.disconnect().catch(() => {})
        throw err
      } finally {
        setConnecting(false)
      }
    },
    [resolveConnector],
  )

  const disconnect = useCallback(async (): Promise<void> => {
    const connector = activeRef.current
    activeRef.current = null
    setAddress(null)
    setFamily(null)
    setWalletId(null)
    if (connector) await connector.disconnect().catch(() => {})
  }, [])

  const login = useCallback(
    async (fam: ChainFamily, challenge: LoginChallenge): Promise<LoginResult> => {
      const chain = familyToLuxChain(fam)
      if (!chain) {
        throw new Error(`useLuxWallet.login: family "${fam}" has no connector`)
      }
      setConnecting(true)
      try {
        const result = await loginWithWallet({
          chain,
          challenge,
          ...(connectorOptions ? { options: connectorOptions } : {}),
        })
        setAddress(result.account.address)
        setFamily(fam)
        setWalletId(result.account.walletId)
        return result
      } finally {
        setConnecting(false)
      }
    },
    [connectorOptions],
  )

  return useMemo(
    () => ({
      address,
      family,
      walletId,
      connecting,
      connect,
      disconnect,
      login,
    }),
    [address, family, walletId, connecting, connect, disconnect, login],
  )
}
