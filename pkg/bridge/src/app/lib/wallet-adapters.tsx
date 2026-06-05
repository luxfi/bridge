// wallet-adapters.tsx — unified wallet abstraction across chain families.
//
// The SDK already speaks EVM (wagmi). This file extends the wallet surface
// to non-EVM families so the bridge UI can show real balances + offer real
// connect buttons for Solana, TON, and Bitcoin. The MPC quorum still
// handles the bridge-leg signing on every family — these adapters expose
// the user-leg only (read balance, optionally sign a deposit later).
//
// One hook to rule them all:
//
//   const w = useWalletForFamily('svm')
//   w.connected      // boolean
//   w.address        // chain-format address (base58 for sol, bc1q… for btc, EQ… for ton)
//   w.connect()      // opens the family's connect modal/flow
//   w.disconnect()
//   w.balance        // human-readable amount in native units (null when not loaded)
//   w.balanceSymbol  // 'SOL', 'BTC', 'TON'
//   w.balanceLoading
//   w.availableWallets  // [{ name, icon? }] — populated for the connect UI
//
// For families that don't have an adapter yet (xrp, cardano, substrate),
// the hook returns a noop shape with connect() rejecting — the UI then
// keeps the existing "MPC-signed — no wallet balance" message.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet as useSolanaWalletInternal,
} from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import type { Adapter } from '@solana/wallet-adapter-base'
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
} from '@solana/web3.js'
import { getWallets as getStandardWallets } from '@wallet-standard/app'
import type { Wallet as StandardWallet } from '@wallet-standard/base'
import {
  TonConnectUIProvider,
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from '@tonconnect/ui-react'
import { useAccount, useBalance, useConnect, useDisconnect } from 'wagmi'
import { XummPkce } from 'xumm-oauth2-pkce'

import { bridgeIdToWagmiChainId } from './wagmi-config'
import type { ChainFamily } from './chains'

// =============================================================================
// Public shape
// =============================================================================

export interface WalletForFamily {
  family: ChainFamily
  address: string | null
  connected: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  // Balance is in human-readable native units (e.g. 1.5 means 1.5 SOL).
  // null when the wallet isn't connected OR balance hasn't loaded yet.
  balance: number | null
  balanceSymbol: string | null
  balanceLoading: boolean
  // Surface for the connect UI — empty for families with a single wallet
  // (sats-connect drives Xverse directly; TonConnect has its own modal).
  availableWallets: { name: string; icon?: string }[]
}

// noopWallet is the shape returned for unimplemented families. Connect
// rejects with a clear reason so the UI can fall back to "no wallet
// support yet" copy without writing per-family branches.
function noopWallet(family: ChainFamily, symbol: string | null): WalletForFamily {
  return {
    family,
    address: null,
    connected: false,
    connecting: false,
    connect: () => Promise.reject(new Error(`No wallet adapter for ${family} yet`)),
    disconnect: () => Promise.resolve(),
    balance: null,
    balanceSymbol: symbol,
    balanceLoading: false,
    availableWallets: [],
  }
}

// =============================================================================
// EVM / Lux (wagmi)
// =============================================================================

// useWalletForEVM returns the EVM/Lux user wallet view. Chain-aware
// balance: the asset's chainId picks the RPC wagmi reads from. When no
// chainId is provided, balance is from the currently-selected wagmi
// chain (the wallet's default).
//
// The connect/disconnect flows route through the existing wagmi
// connectors (injected, coinbase, optional walletConnect) — same UX
// the bridge already had pre-non-EVM.
function useWalletForEVM(
  family: ChainFamily,
  chainId?: number,
  symbol?: string,
  tokenAddress?: string,
): WalletForFamily {
  const acct = useAccount()
  const { connect, connectors, status: connectStatus } = useConnect()
  const { disconnect } = useDisconnect()
  const balanceQuery = useBalance({
    address: acct.address,
    chainId,
    ...(tokenAddress
      ? { token: tokenAddress as `0x${string}` }
      : {}),
    query: {
      enabled: Boolean(acct.address) && chainId !== undefined,
      refetchInterval: 30_000,
    },
  })

  const balance = useMemo(() => {
    const d = balanceQuery.data
    if (!d) return null
    return Number(d.value) / 10 ** d.decimals
  }, [balanceQuery.data])

  const doConnect = useCallback(async () => {
    // Default to the first configured connector (usually injected/MetaMask).
    // Real connect-modal UX is the caller's job — they reach into wagmi
    // directly via useConnect() for that. This is the "one-shot" path
    // for tests + simple consumers.
    const first = connectors[0]
    if (!first) throw new Error('No wagmi connectors configured')
    await connect({ connector: first })
  }, [connect, connectors])

  return {
    family,
    address: acct.address ?? null,
    connected: acct.isConnected,
    connecting: connectStatus === 'pending' || acct.isConnecting,
    connect: doConnect,
    disconnect: async () => {
      await disconnect()
    },
    balance,
    balanceSymbol: balanceQuery.data?.symbol ?? symbol ?? null,
    balanceLoading: balanceQuery.isLoading,
    availableWallets: connectors.map((c) => ({ name: c.name, icon: c.icon })),
  }
}

// =============================================================================
// Solana (svm)
// =============================================================================

// PhantomProvider is the minimal Phantom contract we use. The full
// surface (signTransaction etc.) is larger; we only need connect /
// disconnect / events / publicKey for balance display.
interface PhantomProvider {
  isPhantom?: boolean
  isConnected?: boolean
  publicKey?: { toString(): string } | null
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
  disconnect: () => Promise<void>
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  off?: (event: string, cb: (...args: unknown[]) => void) => void
  // signAndSendTransaction is Phantom's single-call sign+broadcast. We
  // use it on the "phantom-global" connect path (window.phantom.solana)
  // — the @solana/wallet-adapter-react SDK path uses wallet.sendTransaction
  // instead. Returns either {signature: string} (modern Phantom) or a
  // raw string signature (older builds); the caller normalises both.
  signAndSendTransaction?: (
    tx: Transaction,
    opts?: unknown,
  ) => Promise<{ signature: string } | string>
}

function getPhantom(): PhantomProvider | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider }
    solana?: PhantomProvider
  }
  // Modern path: window.phantom.solana. Phantom's docs say isPhantom
  // is always true on its provider; we don't gate on it being truthy
  // anymore because some Phantom versions (and Phantom Multi-Chain in
  // particular) have inconsistent isPhantom values yet still expose
  // a working .connect(). If the global has connect, treat it as a
  // candidate; the actual connect call will reject if it's bogus.
  const fromPhantom = w.phantom?.solana
  if (fromPhantom && typeof fromPhantom.connect === 'function') return fromPhantom
  // Legacy path: window.solana — older Phantom and a few Solana-only
  // wallets (Backpack used to). Only use if it claims to be Phantom OR
  // it has a connect function and nothing else is present.
  const fromGlobal = w.solana
  if (fromGlobal && typeof fromGlobal.connect === 'function') {
    if (fromGlobal.isPhantom) return fromGlobal
  }
  return null
}

// Wallet Standard CAIP namespaces. Phantom's Solana wallet feature
// set advertises support for solana:mainnet plus a handful of chain
// IDs; we don't care about the specific chain, only that the connect
// feature exists.
const SOLANA_CONNECT_FEATURE = 'standard:connect'
const SOLANA_DISCONNECT_FEATURE = 'standard:disconnect'

interface StandardConnectFeature {
  connect: (input?: { silent?: boolean }) => Promise<{
    accounts: ReadonlyArray<{ address: string; publicKey?: Uint8Array }>
  }>
}

interface StandardDisconnectFeature {
  disconnect: () => Promise<void>
}

function findStandardPhantom(): StandardWallet | null {
  if (typeof window === 'undefined') return null
  try {
    const wallets = getStandardWallets().get()
    return wallets.find((w) => w.name === 'Phantom') ?? null
  } catch {
    return null
  }
}

// isSecureOriginForPhantom returns true when the page origin is one
// Phantom (and most browser wallets) will actually open a popup on.
// Phantom's documented security policy:
//   - HTTPS is allowed
//   - http://localhost and http://127.0.0.1 are allowed (dev exception)
//   - http://<public-ip-or-domain> is silently refused (no popup, no
//     rejection — connect() promise hangs forever)
// Catching this client-side avoids the 8-second timeout dance and
// gives the user actionable remediation (use HTTPS, localhost, or a
// tunnel like ngrok). The previous report of "no popup, no error"
// from http://37.60.239.229:3001 matched this exactly.
function isSecureOriginForPhantom(): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.protocol === 'https:') return true
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
    return true
  }
  // .localhost TLD also resolves to loopback per RFC 6761 and Phantom
  // honours it in practice.
  if (host.endsWith('.localhost')) return true
  return false
}

function insecureOriginError(): Error {
  const origin = typeof window !== 'undefined' ? window.location.origin : '(unknown)'
  return new Error(
    `Wallet popups are blocked on ${origin}. Phantom only opens popups on HTTPS sites or localhost. To test locally, use http://localhost:3001 instead. To test against a remote dev server, run it behind HTTPS (cloudflared / ngrok / Caddy).`,
  )
}

// withTimeout wraps a promise with a hard deadline. If the underlying
// call hangs (the symptom we've been chasing in real-user reports), we
// reject with a clear, actionable error instead of leaving the user
// staring at a spinning button.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} did not respond within ${ms / 1000}s — Phantom may be locked. Open the Phantom extension and try again.`))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (err) => {
        clearTimeout(t)
        reject(err)
      },
    )
  })
}

// dumpPhantomDoctor prints a comprehensive snapshot of every Phantom
// integration surface (window globals, Wallet Standard registration,
// SDK adapter list). Helps us debug "no popup" reports remotely: the
// user can paste the doctor output and we see exactly which paths
// are/aren't available without back-and-forth.
function dumpPhantomDoctor(
  prefix: string,
  sdkInfo: { wallets: number; selected: string | null } | null,
): void {
  if (typeof window === 'undefined') {
    if (typeof console !== 'undefined') {
      console.log(`[bridge:solana:doctor] ${prefix} — SSR (window undefined)`)
    }
    return
  }
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider }
    solana?: PhantomProvider
  }
  const lines: string[] = []
  lines.push(`[bridge:solana:doctor] ${prefix}`)
  lines.push(`  origin: ${window.location.origin}`)
  lines.push(`  protocol: ${window.location.protocol}`)
  lines.push(`  window.phantom: ${typeof w.phantom}`)
  lines.push(`  window.phantom?.solana: ${typeof w.phantom?.solana}`)
  if (w.phantom?.solana) {
    lines.push(`    .isPhantom: ${w.phantom.solana.isPhantom}`)
    lines.push(`    .connect: ${typeof w.phantom.solana.connect}`)
    lines.push(`    .disconnect: ${typeof w.phantom.solana.disconnect}`)
    lines.push(`    .isConnected: ${w.phantom.solana.isConnected}`)
    lines.push(`    .publicKey: ${w.phantom.solana.publicKey ? String(w.phantom.solana.publicKey) : 'null'}`)
  }
  lines.push(`  window.solana: ${typeof w.solana}`)
  if (w.solana) {
    lines.push(`    .isPhantom: ${w.solana.isPhantom}`)
    lines.push(`    .connect: ${typeof w.solana.connect}`)
  }
  // Wallet Standard view
  try {
    const wallets = getStandardWallets().get()
    lines.push(`  wallet-standard wallets: ${wallets.length}`)
    for (const ws of wallets) {
      const features = Object.keys(ws.features || {}).join(', ') || '(none)'
      lines.push(`    - ${ws.name} [chains=${ws.chains?.join('|') || '?'}] features={ ${features} }`)
    }
  } catch (err) {
    lines.push(`  wallet-standard threw: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (sdkInfo) {
    lines.push(`  sdk: ${sdkInfo.wallets} wallets, selected=${sdkInfo.selected ?? 'none'}`)
  }
  if (typeof console !== 'undefined') console.log(lines.join('\n'))
}

function useWalletForSVM(): WalletForFamily {
  const conn = useConnection()
  const sol = useSolanaWalletInternal()
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  // Address resolved through ANY of the three connect paths (window
  // global, Wallet Standard direct, SDK adapter). We track it
  // independently because path-1 and path-2 don't update sol.publicKey.
  const [phantomAddress, setPhantomAddress] = useState<string | null>(null)
  const [phantomConnecting, setPhantomConnecting] = useState(false)
  // Hold onto the connect path we successfully used so disconnect can
  // unwind via the same path (avoids cross-path state confusion).
  const lastConnectPathRef = useRef<'phantom-global' | 'wallet-standard' | 'sdk' | null>(null)

  // Run the doctor once at hook mount. Prints every Phantom surface
  // the page can see, which is the data we need to debug "no popup"
  // reports without a remote screenshare.
  useEffect(() => {
    dumpPhantomDoctor('hook mount (v4 triple-path)', null)
  }, [])

  // Subscribe to Phantom's own connect/disconnect events so reloads or
  // user-initiated disconnects from the Phantom extension UI keep our
  // state in sync without us re-querying.
  useEffect(() => {
    const phantom = getPhantom()
    if (!phantom?.on || !phantom.off) return
    const handleConnect = (...args: unknown[]) => {
      const pk = args[0] as { toString(): string } | undefined
      if (pk) setPhantomAddress(pk.toString())
      else if (phantom.publicKey) setPhantomAddress(phantom.publicKey.toString())
      setPhantomConnecting(false)
    }
    const handleDisconnect = () => {
      setPhantomAddress(null)
      setPhantomConnecting(false)
    }
    phantom.on('connect', handleConnect)
    phantom.on('disconnect', handleDisconnect)
    return () => {
      phantom.off?.('connect', handleConnect)
      phantom.off?.('disconnect', handleDisconnect)
    }
  }, [])

  // Fetch native SOL balance whenever a wallet address is set. Reads
  // from EITHER phantomAddress (path 1 or 2) OR sol.publicKey (path 3,
  // SDK adapter). SPL token balances are out of scope here.
  const effectiveAddress =
    phantomAddress ?? (sol.publicKey ? sol.publicKey.toBase58() : null)

  useEffect(() => {
    if (!effectiveAddress || !conn.connection) {
      setBalance(null)
      return
    }
    let cancelled = false
    setBalanceLoading(true)
    void (async () => {
      try {
        const pk = new PublicKey(effectiveAddress)
        const lamports = await readSolanaBalance(conn.connection, pk)
        if (!cancelled) setBalance(lamports / 1_000_000_000)
      } catch {
        if (!cancelled) setBalance(null)
      } finally {
        if (!cancelled) setBalanceLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveAddress, conn.connection])

  const availableWallets = useMemo(
    () => sol.wallets.map((w) => ({ name: w.adapter.name, icon: w.adapter.icon })),
    [sol.wallets],
  )

  const connected = phantomAddress !== null || sol.connected
  const address = phantomAddress ?? (sol.publicKey ? sol.publicKey.toBase58() : null)

  const log = (msg: string): void => {
    if (typeof console !== 'undefined') console.log(`[bridge:solana] ${msg}`)
  }

  return {
    family: 'svm',
    address,
    connected,
    connecting: phantomConnecting || sol.connecting,
    connect: async () => {
      if (connected) {
        log('already connected — no-op')
        return
      }

      dumpPhantomDoctor('connect click', {
        wallets: sol.wallets.length,
        selected: sol.wallet?.adapter.name ?? null,
      })

      // Preflight: Phantom (and most wallet extensions) refuse to open
      // popups from non-HTTPS, non-localhost origins. They don't
      // reject the connect promise — they just never resolve it. Fail
      // fast with an actionable message so the user knows it's an
      // origin problem, not a bridge bug.
      if (!isSecureOriginForPhantom()) {
        log(`PREFLIGHT FAIL: insecure origin ${window.location.origin} — Phantom will not show a popup`)
        throw insecureOriginError()
      }

      setPhantomConnecting(true)
      try {
        // ---- Path 1: window.phantom.solana.connect() ----
        // Phantom's documented, oldest, most-direct integration. If
        // the global is injected and isn't broken, this opens the
        // popup synchronously inside the click gesture.
        const phantom = getPhantom()
        if (phantom) {
          log(`path 1: window.phantom.solana.connect() (isPhantom=${phantom.isPhantom})`)
          try {
            const resp = await withTimeout(phantom.connect(), 8000, 'window.phantom.solana.connect()')
            const pk = resp.publicKey.toString()
            setPhantomAddress(pk)
            lastConnectPathRef.current = 'phantom-global'
            log(`path 1 SUCCESS: address=${pk}`)
            return
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            log(`path 1 FAILED: ${msg}`)
            // Re-raise user rejections — don't try other paths because
            // the user explicitly said no. Heuristic: if the message
            // mentions reject/cancel/denied, that's a user decision.
            if (/reject|cancel|denied/i.test(msg)) throw err
            // For timeouts and other failures, try the next path.
          }
        } else {
          log('path 1 SKIPPED: window.phantom.solana not available')
        }

        // ---- Path 2: Wallet Standard direct ----
        // Bypasses @solana/wallet-adapter-react's StandardWalletAdapter
        // wrapper and calls Phantom's standard:connect feature
        // directly. If the SDK wrapper is the layer hanging, this
        // unblocks the popup.
        const standardPhantom = findStandardPhantom()
        if (standardPhantom) {
          const features = standardPhantom.features as Record<string, unknown>
          const connectFeature = features[SOLANA_CONNECT_FEATURE] as StandardConnectFeature | undefined
          if (connectFeature && typeof connectFeature.connect === 'function') {
            log('path 2: wallet-standard standard:connect()')
            try {
              const result = await withTimeout(
                connectFeature.connect(),
                8000,
                'wallet-standard standard:connect',
              )
              const accounts = result.accounts ?? []
              const first = accounts[0]
              if (!first) throw new Error('Wallet Standard returned no accounts')
              setPhantomAddress(first.address)
              lastConnectPathRef.current = 'wallet-standard'
              log(`path 2 SUCCESS: address=${first.address}`)
              return
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              log(`path 2 FAILED: ${msg}`)
              if (/reject|cancel|denied/i.test(msg)) throw err
            }
          } else {
            log('path 2 SKIPPED: standard:connect feature missing on Phantom')
          }
        } else {
          log('path 2 SKIPPED: Phantom not registered with wallet-standard')
        }

        // ---- Path 3: SDK fallback (sol.connect via adapter) ----
        // Original path. Observed to hang for some users, but other
        // wallets (Solflare, Backpack) only ship the SDK adapter, so
        // this remains as the final fallback.
        if (sol.wallets.length === 0) {
          throw new Error(
            'No Solana wallet detected. Install Phantom from phantom.app and reload.',
          )
        }
        const target =
          sol.wallets.find((w) => String(w.readyState) === 'Installed') ?? sol.wallets[0]
        if (!target) {
          throw new Error('No Solana wallet detected.')
        }
        const name = target.adapter.name
        if (!sol.wallet || sol.wallet.adapter.name !== name) {
          flushSync(() => {
            sol.select(name)
          })
        }
        log(`path 3: sol.connect() via SDK (target=${name})`)
        await withTimeout(sol.connect(), 8000, 'sol.connect()')
        lastConnectPathRef.current = 'sdk'
        log('path 3 SUCCESS')
      } finally {
        setPhantomConnecting(false)
      }
    },
    disconnect: async () => {
      const path = lastConnectPathRef.current
      log(`disconnect via path=${path ?? 'unknown'}`)
      // Try the path we connected through first; fall through to the
      // other paths so any lingering state on different surfaces gets
      // cleared regardless of which one we actually used.
      if (path === 'phantom-global' || path === null) {
        const phantom = getPhantom()
        if (phantom) {
          try {
            await phantom.disconnect()
          } catch {
            /* already disconnected */
          }
        }
      }
      if (path === 'wallet-standard' || path === null) {
        const standardPhantom = findStandardPhantom()
        if (standardPhantom) {
          const features = standardPhantom.features as Record<string, unknown>
          const disconnectFeature = features[SOLANA_DISCONNECT_FEATURE] as StandardDisconnectFeature | undefined
          if (disconnectFeature && typeof disconnectFeature.disconnect === 'function') {
            try {
              await disconnectFeature.disconnect()
            } catch {
              /* already disconnected */
            }
          }
        }
      }
      if (sol.connected) {
        try {
          await sol.disconnect()
        } catch {
          /* already disconnected */
        }
      }
      setPhantomAddress(null)
      lastConnectPathRef.current = null
    },
    balance,
    balanceSymbol: 'SOL',
    balanceLoading,
    availableWallets,
  }
}

async function readSolanaBalance(connection: Connection, pubkey: PublicKey): Promise<number> {
  return connection.getBalance(pubkey)
}

// =============================================================================
// useSolanaSend — auto-deposit helper for SOL-source swaps
// =============================================================================
//
// Pops the user's connected Solana wallet to sign and send a
// SystemProgram.transfer to the MPC deposit address. Mirrors the role
// of wagmi's sendTransactionAsync in the EVM auto-deposit path.
//
// Routes through whichever connect path the user is on:
//   - SDK adapter (path 3 in useWalletForSVM): wallet.sendTransaction
//   - Phantom global (path 1): provider.signAndSendTransaction
//
// Path 2 (Wallet Standard direct) returns through the SDK adapter once
// the user is connected, so the SDK branch covers it.
//
// Returns the base58 transaction signature (Solana's canonical tx id).
// Throws when no wallet is connected, when the address is invalid, or
// when the user rejects the popup.
export function useSolanaSend(): {
  sendSolAsync: (args: { to: string; sol: number }) => Promise<string>
  ready: boolean
  // Base58 pubkey of the connected Solana wallet, resolved across
  // both the SDK-adapter path and the phantom-global path. Null when
  // no Solana wallet is connected. Used by useTransfers to populate
  // `sender` on createSwap for SVM-source swaps — without this the
  // bridge would fall back to the EVM `account.address` and the
  // refund driver would later choke on a non-base58 sender.
  //
  // IMPORTANT: this hook subscribes to Phantom's connect/disconnect
  // events so a late-binding wallet connection forces a re-render
  // and bubbles the new pubkey up to useTransfers. Otherwise an
  // initial render with no wallet captures `null` into useCallback
  // closures and a later connect doesn't refresh them — the SPA
  // would silently submit createSwap with no sender, and the bridge
  // would reject with "missing_source_chain_sender".
  senderAddress: string | null
} {
  const conn = useConnection()
  const sol = useSolanaWalletInternal()

  // Snapshot at hook call so the returned function captures stable
  // refs. React's reconciler re-runs the hook when sol.publicKey
  // changes, so this stays current without explicit subscriptions.
  //
  // The @solana/wallet-adapter-react hook reads through getters that
  // throw when no WalletProvider ancestor is mounted (the case for
  // every test rig that doesn't include NonEVMProviders, plus any
  // bridge embed that disables non-EVM families). We tolerate that
  // by treating SDK state as absent — sendSolAsync will fall through
  // to the phantom-global path or error out clearly when neither is
  // available, instead of crashing the host component on mount.
  let sdkPublicKey: PublicKey | null = null
  let sdkSend: ReturnType<typeof useSolanaWalletInternal>['sendTransaction'] | undefined
  let sdkConnected = false
  try {
    sdkPublicKey = sol.publicKey
    sdkSend = sol.sendTransaction
    sdkConnected = sol.connected
  } catch {
    // No WalletProvider in scope — leave SDK refs unset.
  }

  // Phantom-global subscription: when the user connects via the
  // window.phantom.solana path (path 1) or Wallet Standard direct
  // (path 2), sol.publicKey stays null because the SDK adapter
  // never sees the connection. The provider DOES emit connect /
  // disconnect events on its own surface though, so we mirror them
  // into local state. Without this hook a late-binding connect
  // never triggers a re-render of useTransfers, the useCallback
  // closure keeps its initial null senderAddress, and createSwap
  // submits with no sender field — bridge rejects 400 with
  // "missing_source_chain_sender" even though the wallet is
  // actually connected and ready to sign.
  const [phantomGlobalAddress, setPhantomGlobalAddress] = useState<string | null>(
    () => getPhantom()?.publicKey?.toString() ?? null,
  )
  useEffect(() => {
    const phantom = getPhantom()
    if (!phantom?.on || !phantom.off) return
    // Initial sync — phantom may already be connected by the time
    // this effect runs (returning user, page reload, etc.).
    if (phantom.publicKey) {
      setPhantomGlobalAddress(phantom.publicKey.toString())
    }
    const handleConnect = (...args: unknown[]) => {
      const pk = args[0] as { toString(): string } | undefined
      if (pk) setPhantomGlobalAddress(pk.toString())
      else if (phantom.publicKey) setPhantomGlobalAddress(phantom.publicKey.toString())
    }
    const handleDisconnect = () => {
      setPhantomGlobalAddress(null)
    }
    phantom.on('connect', handleConnect)
    phantom.on('disconnect', handleDisconnect)
    return () => {
      phantom.off?.('connect', handleConnect)
      phantom.off?.('disconnect', handleDisconnect)
    }
  }, [])

  const sendSolAsync = useCallback(
    async (args: { to: string; sol: number }): Promise<string> => {
      if (!conn.connection) {
        throw new Error('Solana RPC connection not ready')
      }
      if (!Number.isFinite(args.sol) || args.sol <= 0) {
        throw new Error(`Invalid SOL amount: ${args.sol}`)
      }

      // Resolve the sender pubkey from whichever path is live.
      const phantom = getPhantom()
      const fromBase58 =
        sdkPublicKey?.toBase58() ?? phantom?.publicKey?.toString() ?? null
      if (!fromBase58) {
        throw new Error('No Solana wallet connected')
      }

      let fromPubkey: PublicKey
      let toPubkey: PublicKey
      try {
        fromPubkey = new PublicKey(fromBase58)
        toPubkey = new PublicKey(args.to)
      } catch (err) {
        throw new Error(
          `Invalid Solana address: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      // Round to whole lamports — Solana doesn't support fractional
      // lamports. parseFloat * 1e9 can yield non-integers from imprecise
      // user input ("0.01" → 9999999.999... in some flows), so coerce
      // explicitly. Math.round biases tie-break toward "send slightly
      // more" rather than "deposit short" — strictly better for the
      // bridge's deposit-confirm threshold.
      const lamports = Math.round(args.sol * LAMPORTS_PER_SOL)
      if (lamports <= 0) {
        throw new Error(`SOL amount rounds to 0 lamports: ${args.sol}`)
      }

      const { blockhash, lastValidBlockHeight } =
        await conn.connection.getLatestBlockhash()

      const tx = new Transaction({
        feePayer: fromPubkey,
        blockhash,
        lastValidBlockHeight,
      })
      tx.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        }),
      )

      // Path A — SDK adapter is fully wired (path-3 connect): use its
      // sendTransaction, which handles signing + broadcast against the
      // SDK's Connection.
      if (sdkConnected && sdkSend) {
        return sdkSend(tx, conn.connection)
      }

      // Path B — phantom-global connect: call the provider directly.
      if (phantom?.signAndSendTransaction) {
        const result = await phantom.signAndSendTransaction(tx)
        if (typeof result === 'string') return result
        if (result && typeof result.signature === 'string') return result.signature
        throw new Error('Phantom signAndSendTransaction returned no signature')
      }

      throw new Error(
        'No Solana send path available — connect a wallet that supports sending transactions',
      )
    },
    [conn.connection, sdkConnected, sdkPublicKey, sdkSend],
  )

  // Prefer the live state subscription (phantomGlobalAddress) over
  // the raw getPhantom() lookup so a late-binding connect actually
  // bubbles up; fall back to the raw lookup for SSR / no-provider
  // contexts where the effect hasn't run yet.
  const phantomAddr =
    phantomGlobalAddress ?? getPhantom()?.publicKey?.toString() ?? null
  const ready = Boolean(sdkPublicKey || phantomAddr)
  const senderAddress = sdkPublicKey?.toBase58() ?? phantomAddr ?? null

  return { sendSolAsync, ready, senderAddress }
}

// =============================================================================
// TON
// =============================================================================

function useWalletForTON(): WalletForFamily {
  // Same tolerance pattern as useSolanaSend / useTonSend: the
  // @tonconnect/ui-react hooks throw TonConnectProviderNotSetError
  // when no TonConnectUIProvider is mounted, which breaks test
  // rigs that don't include NonEVMProviders AND the
  // useWalletForFamily('btc'/'svm'/'evm') dispatcher (which calls
  // ALL family hooks unconditionally to satisfy rules-of-hooks).
  // Degrading to "no address, no wallet" lets the dispatcher
  // continue to its real branch without crashing the host.
  let address = ''
  let wallet: unknown = null
  let tonConnectUI: ReturnType<typeof useTonConnectUI>[0] | undefined
  try {
    address = useTonAddress()
  } catch {
    address = ''
  }
  try {
    wallet = useTonWallet()
  } catch {
    wallet = null
  }
  try {
    ;[tonConnectUI] = useTonConnectUI()
  } catch {
    tonConnectUI = undefined
  }
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  // Fetch native TON balance via the public toncenter API. TonConnect
  // itself doesn't expose balance — wallets surface it in their own UI
  // but not through the connector. toncenter is the standard read-RPC.
  useEffect(() => {
    if (!address) {
      setBalance(null)
      return
    }
    let cancelled = false
    setBalanceLoading(true)
    void readTonBalance(address)
      .then((nano) => {
        if (cancelled) return
        // 1 TON = 1e9 nanoTON.
        setBalance(nano / 1_000_000_000)
      })
      .catch(() => {
        if (cancelled) return
        setBalance(null)
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  return {
    family: 'ton',
    address: address || null,
    connected: Boolean(wallet),
    connecting: false, // TonConnect doesn't surface a pending state
    connect: async () => {
      if (!tonConnectUI) {
        throw new Error('TonConnect provider not mounted — wrap with NonEVMProviders or pass a tonManifestUrl.')
      }
      await tonConnectUI.openModal()
    },
    disconnect: async () => {
      if (!tonConnectUI) return
      await tonConnectUI.disconnect()
    },
    balance,
    balanceSymbol: 'TON',
    balanceLoading,
    availableWallets: [],
  }
}

async function readTonBalance(address: string): Promise<number> {
  // toncenter v2 GET /api/v2/getAddressBalance?address=<a>
  // Returns {"ok":true,"result":"123456789"} where result is nanoTON.
  //
  // TON has separate mainnet + testnet toncenter hosts. The user-friendly
  // address encodes which network it belongs to via the first two chars:
  //   0Q / kQ → testnet (non-bounceable / bounceable)
  //   UQ / EQ → mainnet (non-bounceable / bounceable)
  // Querying mainnet toncenter for a testnet address returns balance 0,
  // which is exactly the bug the UI surfaces when Tonkeeper is on testnet
  // and the SPA pretends the address is mainnet.
  const prefix = address.slice(0, 2)
  const isTestnet = prefix === '0Q' || prefix === 'kQ'
  const host = isTestnet ? 'testnet.toncenter.com' : 'toncenter.com'
  const url = `https://${host}/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`toncenter HTTP ${r.status}`)
  const j = (await r.json()) as { ok: boolean; result: string }
  if (!j.ok) throw new Error('toncenter: ok=false')
  return Number(j.result)
}

// =============================================================================
// useTonSend — auto-deposit helper for TON-source swaps
// =============================================================================
//
// Pops the user's connected TonConnect wallet (Tonkeeper, MyTonWallet,
// OpenMask, etc.) to sign and send a native TON transfer to the MPC
// deposit address. Mirrors the role of useSolanaSend for SVM and
// wagmi's sendTransactionAsync for EVM.
//
// TonConnect's protocol is more uniform than Solana's three-path
// connect mess — every wallet routes through tonConnectUI.sendTransaction
// regardless of how the user connected. There's no path 1 / path 2 /
// path 3 split, so the implementation is small.
//
// Returns the wallet's resolved address alongside the send function so
// useTransfers can populate `sender` on createSwap for TON-source swaps
// without a second hook lookup.
//
// The TonConnect spec encodes nanoTON as a decimal string, so the SPA
// scales the human-readable TON amount with toNanoTon. We don't trust
// blind multiplication by 1e9 because float math at 9 decimals drops
// trailing nano (0.1 TON × 1e9 = 99_999_999.99999999 → 99999999 via
// Math.floor). Math.round is the right rounding policy — matches the
// floatToBaseUnits convention on the Go side (txassembler/ton.go).
export function useTonSend(): {
  sendTonAsync: (args: { to: string; ton: number }) => Promise<string>
  ready: boolean
  /** TonConnect-resolved address ('EQ.../UQ...' mainnet, 'kQ.../0Q...' testnet). Null when no TON wallet is connected. */
  senderAddress: string | null
} {
  // Mirror useSolanaSend's tolerance: the @tonconnect/ui-react hooks
  // throw with a clear "TonConnectProviderNotSetError" if no
  // TonConnectUIProvider ancestor is mounted. That breaks every test
  // rig that doesn't include NonEVMProviders. Catch and degrade to a
  // no-op so the host component renders cleanly — sendTonAsync then
  // throws at call time, which is exactly what we want for tests
  // that never trigger the deposit path.
  let address: string | null = null
  let tonConnectUI: ReturnType<typeof useTonConnectUI>[0] | undefined
  try {
    address = useTonAddress() || null
  } catch {
    address = null
  }
  try {
    ;[tonConnectUI] = useTonConnectUI()
  } catch {
    tonConnectUI = undefined
  }

  const sendTonAsync = useCallback(
    async ({ to, ton }: { to: string; ton: number }): Promise<string> => {
      if (!tonConnectUI) {
        throw new Error('TonConnect provider not mounted — wrap the SDK with NonEVMProviders or pass a tonManifestUrl.')
      }
      if (!address) {
        throw new Error('No TON wallet connected. Open the wallet selector and pick Tonkeeper / MyTonWallet first.')
      }
      if (!Number.isFinite(ton) || ton <= 0) {
        throw new Error(`Invalid TON amount: ${ton}`)
      }
      const amountNano = String(Math.round(ton * 1_000_000_000))
      // TonConnect validUntil is unix epoch seconds. 5 minutes is the
      // standard upper bound for a user to confirm in the wallet UI;
      // longer windows can be re-broadcast even after the SPA tab is
      // closed which is bad UX for a bridge deposit.
      const validUntil = Math.floor(Date.now() / 1000) + 300
      const res = await tonConnectUI.sendTransaction({
        validUntil,
        messages: [{ address: to, amount: amountNano }],
      })
      // res.boc is the signed BoC base64 — TonConnect's canonical tx
      // identifier. There's no separate "tx hash" returned; downstream
      // code that wants an explorer link should derive sha256(BoC)
      // from this on the server side, same convention the bridge's
      // broadcastTON uses.
      return res.boc
    },
    [address, tonConnectUI],
  )

  return {
    sendTonAsync,
    ready: Boolean(address),
    senderAddress: address,
  }
}

// =============================================================================
// Bitcoin (sats-connect)
// =============================================================================
//
// BTC connection state lives in BTCWalletContext, NOT in the hook's
// local useState. Reason: the WalletConnect dialog and the AssetInput
// row both call useWalletForFamily('btc'), and without a shared
// provider each call gets its own useState — so a successful connect
// in the dialog never propagates to the asset input's balance row.
// (Solana / TON dodge this because their adapter libraries ship their
// own React Context out of the box; sats-connect doesn't.)

const BTCWalletContext = createContext<WalletForFamily | null>(null)

const BTCWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const sats = await import('sats-connect')
      // sats-connect v4: provider request API. Cast to never sidesteps
      // a long-standing v4 typing quirk where Params<'getAccounts'>
      // doesn't narrow from the string literal cleanly.
      const resp = await sats.default.request('getAccounts', {
        purposes: ['payment'],
        message: 'Connect to the Lux Bridge',
      } as never)
      if (resp.status !== 'success') {
        const err = (resp as { error?: { message?: string; code?: number } }).error
        throw new Error(`sats-connect status=${resp.status}${err?.message ? `: ${err.message}` : ''}`)
      }
      // getAccounts returns result: [{ address, addressType, publicKey, purpose, walletType }]
      const accounts = (resp as { result: Array<{ address: string; purpose: string }> }).result
      const paymentAcct = accounts.find((a) => a.purpose === 'payment') ?? accounts[0]
      if (!paymentAcct) throw new Error('sats-connect: no payment account returned')
      setAddress(paymentAcct.address)
      setConnected(true)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setAddress(null)
    setConnected(false)
    setBalance(null)
    // sats-connect has no explicit disconnect — clearing local state
    // is sufficient; the user revokes site access in their wallet UI.
  }, [])

  // Refresh BTC balance via mempool.space (public + open CORS) when
  // the address changes. Returns satoshis; we convert to BTC.
  useEffect(() => {
    if (!address) {
      setBalance(null)
      return
    }
    let cancelled = false
    setBalanceLoading(true)
    void readBtcBalance(address)
      .then((sats) => {
        if (cancelled) return
        // 1 BTC = 1e8 satoshis.
        setBalance(sats / 100_000_000)
      })
      .catch(() => {
        if (cancelled) return
        setBalance(null)
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  const value = useMemo<WalletForFamily>(
    () => ({
      family: 'btc',
      address,
      connected,
      connecting,
      connect,
      disconnect,
      balance,
      balanceSymbol: 'BTC',
      balanceLoading,
      availableWallets: [],
    }),
    [address, connected, connecting, connect, disconnect, balance, balanceLoading],
  )

  return <BTCWalletContext.Provider value={value}>{children}</BTCWalletContext.Provider>
}

// Fallback used when no BTCWalletProvider is mounted upstream (legacy
// host apps): every hook call still gets its own useState, so connect
// in one component won't propagate to others — but the existing
// behavior (single-component flows) keeps working.
function useFallbackBTCWallet(): WalletForFamily {
  const [address, setAddress] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const sats = await import('sats-connect')
      const resp = await sats.default.request('getAccounts', {
        purposes: ['payment'],
        message: 'Connect to the Lux Bridge',
      } as never)
      if (resp.status !== 'success') {
        throw new Error(`sats-connect status=${resp.status}`)
      }
      const accounts = (resp as { result: Array<{ address: string; purpose: string }> }).result
      const paymentAcct = accounts.find((a) => a.purpose === 'payment') ?? accounts[0]
      if (!paymentAcct) throw new Error('sats-connect: no payment account returned')
      setAddress(paymentAcct.address)
      setConnected(true)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setAddress(null)
    setConnected(false)
    setBalance(null)
  }, [])

  useEffect(() => {
    if (!address) {
      setBalance(null)
      return
    }
    let cancelled = false
    setBalanceLoading(true)
    void readBtcBalance(address)
      .then((sats) => {
        if (!cancelled) setBalance(sats / 100_000_000)
      })
      .catch(() => {
        if (!cancelled) setBalance(null)
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  return {
    family: 'btc',
    address,
    connected,
    connecting,
    connect,
    disconnect,
    balance,
    balanceSymbol: 'BTC',
    balanceLoading,
    availableWallets: [],
  }
}

function useWalletForBTC(): WalletForFamily {
  const ctx = useContext(BTCWalletContext)
  // Hooks rule of order: both branches must call the same hooks. We
  // call the fallback hook unconditionally; when the provider IS
  // mounted (the common case) we just discard its state and return
  // the shared context value instead.
  const fallback = useFallbackBTCWallet()
  return ctx ?? fallback
}

// isTestnetBtcAddress detects testnet3 addresses by base58/bech32 prefix.
// Mainnet P2PKH/P2SH/bech32 start with 1, 3, bc1. Testnet3 equivalents
// start with m, n, 2, tb1. Address-driven so it works whether Xverse is
// on testnet because the user switched it, or because the bridge is in
// testnet env — the displayed balance always matches the actual address.
function isTestnetBtcAddress(address: string): boolean {
  if (address.toLowerCase().startsWith('tb1')) return true
  const first = address.charAt(0)
  return first === 'm' || first === 'n' || first === '2'
}

async function readBtcBalance(address: string): Promise<number> {
  // mempool.space GET /api/address/<addr> on mainnet, /testnet/api/... on testnet3.
  // Returns { chain_stats: { funded_txo_sum, spent_txo_sum, ... }, ... }
  // Balance = funded - spent.
  const base = isTestnetBtcAddress(address)
    ? 'https://mempool.space/testnet/api'
    : 'https://mempool.space/api'
  const url = `${base}/address/${encodeURIComponent(address)}`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`mempool.space HTTP ${r.status}`)
  const j = (await r.json()) as {
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number }
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number }
  }
  const confirmed = j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum
  const pending = j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum
  return confirmed + pending
}

// =============================================================================
// XRP (Xaman / XUMM)
// =============================================================================
//
// Xaman is a mobile-first non-custodial XRP wallet (formerly XUMM). The
// browser SDK is xumm-oauth2-pkce: the app creates a PKCE authorize
// request, the user scans a QR (or opens a deeplink on mobile), Xaman
// returns a JWT + the user's r-address. We never see the private key.
//
// Why Context (not per-component hook) — same pattern as BTC: a single
// XummPkce instance must drive every component that reads address /
// balance / connect status. Mounting the SDK twice (e.g. once in the
// connect dialog, once in the asset row) would create two separate
// auth listeners that don't agree on state.
//
// SSR safe: the SDK touches window/localStorage at construction time,
// so we lazy-init in a useEffect inside the provider — never at module
// scope. Tests that don't mount NonEVMProviders fall through to the
// noop wallet so they don't crash on import.
//
// The API key is a UUID issued by apps.xaman.dev. It's public-safe
// (the SDK is designed for browser use); the matching API SECRET is
// backend-only and stays out of the SPA bundle.

const XRPWalletContext = createContext<WalletForFamily | null>(null)

interface XRPWalletProviderProps {
  /** Xaman API key (UUID from apps.xaman.dev). Public-safe. */
  apiKey: string
  children: ReactNode
}

const XRPWalletProvider: FC<XRPWalletProviderProps> = ({ apiKey, children }) => {
  const [address, setAddress] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const xummRef = useRef<XummPkce | null>(null)

  // Lazy-init the SDK after mount so SSR doesn't try to touch window.
  // The SDK persists tokens in localStorage; a returning user lands in
  // the 'retrieved' handler with an active session and skips the QR.
  useEffect(() => {
    if (typeof window === 'undefined' || !apiKey) return
    try {
      const sdk = new XummPkce(apiKey, { implicit: true })
      xummRef.current = sdk
      // 'retrieved' fires when an existing session is restored from
      // localStorage on page reload. 'success' fires after a fresh
      // authorize() completes. Both expose the same state shape.
      const hydrate = async () => {
        try {
          const state = await sdk.state()
          const acct = state?.me?.account
          if (acct) {
            setAddress(acct)
            setConnected(true)
          }
        } catch {
          // empty state is the expected "no session yet" path
        }
      }
      sdk.on('retrieved', hydrate)
      sdk.on('success', hydrate)
      sdk.on('error', () => {
        setConnecting(false)
      })
      void hydrate()
    } catch (e) {
      // Bad API key, network down, etc. — fall back to "no wallet" so
      // the dispatcher still returns a callable shape; connect() will
      // error with a clear message when the user actually clicks.
      // eslint-disable-next-line no-console
      console.warn('[xaman] SDK init failed:', e)
    }
  }, [apiKey])

  const connect = useCallback(async () => {
    if (!xummRef.current) {
      throw new Error(
        'Xaman SDK not initialized — set VITE_XAMAN_API_KEY (or pass xamanApiKey to NonEVMProviders).',
      )
    }
    setConnecting(true)
    try {
      const state = await xummRef.current.authorize()
      const acct = state?.me?.account
      if (acct) {
        setAddress(acct)
        setConnected(true)
      }
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await xummRef.current?.logout()
    } catch {
      // SDK throws if there's no session; clearing local state is the
      // outcome the caller wants regardless.
    }
    setAddress(null)
    setConnected(false)
    setBalance(null)
  }, [])

  // Balance refresh whenever the connected address changes. XRPL public
  // cluster has permissive CORS so the browser call works directly.
  useEffect(() => {
    if (!address) {
      setBalance(null)
      return
    }
    let cancelled = false
    setBalanceLoading(true)
    void readXrpBalance(address)
      .then((drops) => {
        if (cancelled) return
        // 1 XRP = 1e6 drops.
        setBalance(drops / 1_000_000)
      })
      .catch(() => {
        if (cancelled) return
        setBalance(null)
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  const value = useMemo<WalletForFamily>(
    () => ({
      family: 'xrp',
      address,
      connected,
      connecting,
      connect,
      disconnect,
      balance,
      balanceSymbol: 'XRP',
      balanceLoading,
      availableWallets: [],
    }),
    [address, connected, connecting, connect, disconnect, balance, balanceLoading],
  )

  return <XRPWalletContext.Provider value={value}>{children}</XRPWalletContext.Provider>
}

function useWalletForXRP(): WalletForFamily {
  const ctx = useContext(XRPWalletContext)
  // No provider mounted (test rig or tenant that didn't pass an API
  // key) → return a noop. Connect rejects with a clear message rather
  // than crashing the dispatcher.
  return ctx ?? noopWallet('xrp', 'XRP')
}

// readXrpBalance queries the XRPL public cluster's JSON-RPC for the
// XRP account balance, returning drops (1 XRP = 1e6 drops). Testnet
// vs mainnet endpoint is chosen via VITE_BRIDGE_XRP_RPC_URL: empty/
// unset routes to mainnet (xrplcluster.com), 'testnet' routes to the
// altnet endpoint. Tenants can override with any JSON-RPC URL.
//
// Note: XRPL accounts unfunded below the 2 XRP reserve report as
// 'actNotFound'; we return 0 instead of throwing so the UI renders
// "0 XRP" instead of "error".
async function readXrpBalance(address: string): Promise<number> {
  const envUrl =
    typeof window !== 'undefined' &&
    (window as unknown as { __ENV?: Record<string, string> }).__ENV?.[
      'VITE_BRIDGE_XRP_RPC_URL'
    ]
  // Vite-build-time fallback when window.__ENV isn't injected (local dev).
  // The narrow VITE_BRIDGE_XRP_RPC_URL access avoids TS-on-import.meta noise.
  const buildEnvUrl =
    (typeof import.meta !== 'undefined' &&
      ((import.meta as unknown as { env?: Record<string, string> }).env?.[
        'VITE_BRIDGE_XRP_RPC_URL'
      ] as string | undefined)) ||
    undefined
  const userUrl = (envUrl as string | undefined) ?? buildEnvUrl
  // 'testnet' is a shorthand that resolves to the canonical altnet RPC.
  const url =
    userUrl === 'testnet'
      ? 'https://s.altnet.rippletest.net:51234'
      : userUrl || 'https://xrplcluster.com'

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_info',
      params: [{ account: address, ledger_index: 'validated' }],
    }),
  })
  if (!r.ok) throw new Error(`XRPL HTTP ${r.status}`)
  const j = (await r.json()) as {
    result?: {
      status?: string
      error?: string
      account_data?: { Balance?: string }
    }
  }
  if (j.result?.status === 'error') {
    if (j.result.error === 'actNotFound') return 0
    throw new Error(`XRPL: ${j.result.error}`)
  }
  return Number(j.result?.account_data?.Balance ?? 0)
}

// =============================================================================
// Family dispatcher
// =============================================================================

/**
 * useWalletForFamily routes to the right adapter for the chain family.
 *
 * For EVM/Lux the chainId is required to read a chain-specific balance
 * (the wagmi default is the wallet's currently-selected chain, which
 * may not be the swap's source chain). Other families are
 * chainId-agnostic — Solana/TON/BTC have one mainnet each (the
 * adapter is configured to that endpoint at provider mount time).
 */
export function useWalletForFamily(
  family: ChainFamily,
  options: { chainId?: number; symbol?: string; tokenAddress?: string } = {},
): WalletForFamily {
  // Always call all hooks to satisfy React's rules-of-hooks. The
  // dispatcher then picks the right return. Cost is small — the
  // non-active hooks short-circuit because their providers see no
  // address/publicKey to balance-read against.
  const evm = useWalletForEVM(family, options.chainId, options.symbol, options.tokenAddress)
  const svm = useWalletForSVM()
  const ton = useWalletForTON()
  const btc = useWalletForBTC()
  const xrp = useWalletForXRP()

  switch (family) {
    case 'evm':
    case 'lux':
      return evm
    case 'svm':
      return svm
    case 'ton':
      return ton
    case 'btc':
      return btc
    case 'xrp':
      return xrp
    case 'cardano':
    case 'substrate':
    default:
      return noopWallet(family, family === 'cardano' ? 'ADA' : 'DOT')
  }
}

/**
 * Convenience: resolves the chain family + wagmi chainId from a
 * bridge ID like "lux:96369" or "svm:101".
 */
export function useWalletForBridgeId(
  bridgeId: string,
  symbol?: string,
  tokenAddress?: string,
): WalletForFamily {
  const family = familyForBridgeId(bridgeId)
  const chainId = bridgeIdToWagmiChainId(bridgeId)
  const opts: { chainId?: number; symbol?: string; tokenAddress?: string } = {}
  if (chainId !== null) opts.chainId = chainId
  if (symbol !== undefined) opts.symbol = symbol
  if (tokenAddress !== undefined) opts.tokenAddress = tokenAddress
  return useWalletForFamily(family, opts)
}

function familyForBridgeId(bridgeId: string): ChainFamily {
  const prefix = bridgeId.split(':', 1)[0]
  switch (prefix) {
    case 'evm':
      return 'evm'
    case 'lux':
      return 'lux'
    case 'svm':
      return 'svm'
    case 'btc':
      return 'btc'
    case 'ton':
      return 'ton'
    case 'xrp':
      return 'xrp'
    case 'cardano':
      return 'cardano'
    case 'polkadot':
      return 'substrate'
    default:
      return 'evm'
  }
}

// =============================================================================
// Providers
// =============================================================================

// solanaWalletAdapters is constructed once per process. Phantom covers
// the largest share of Solana wallet users; other adapters (Solflare,
// Backpack, etc.) can be added when their transitive deps don't
// confuse vitest's ESM resolver. The Solana Wallet Standard means
// any Standard-compliant wallet (Backpack newer versions, Glow,
// some Phantom flows) also surface here without an explicit adapter.
const solanaWalletAdapters: Adapter[] = [new PhantomWalletAdapter()]

interface NonEVMProvidersProps {
  /**
   * Solana RPC endpoint. Defaults to publicnode (publicly accessible,
   * CORS-permissive, no API key, no Origin allow-list).
   *
   * Why not api.mainnet-beta.solana.com? The "official" endpoint
   * rate-limits hard and returns 403 to many origins outright (any
   * Cloudflare-tunneled dev host, anonymized residential IPs, etc.).
   * Switching to publicnode keeps the SDK working out-of-box for dev
   * tunnels (trycloudflare/ngrok/Caddy) without per-tenant config.
   *
   * Tenants still override for higher rate limits (Helius, QuickNode,
   * Triton, or a self-hosted RPC behind their auth).
   */
  solanaRpcUrl?: string
  /**
   * Optional TonConnect manifest URL. TonConnect requires a JSON
   * manifest at a public URL describing the app — Tonkeeper (and
   * every other TonConnect wallet) downloads it before issuing a
   * signing prompt to verify the app's identity. When omitted, we
   * default to `${origin}/tonconnect-manifest.json` so each
   * deployment (localhost, tunnel, prod) serves its own manifest
   * from its own origin — no hardcoded prod URL that 404s on dev.
   * Tenants still override for custom branding or a CDN-hosted
   * manifest.
   */
  tonManifestUrl?: string
  /**
   * Xaman (XRP) API key — UUID issued by apps.xaman.dev. Public-safe;
   * the matching API SECRET stays backend-only.
   *
   * Resolution order at runtime:
   *   1. explicit `xamanApiKey` prop here
   *   2. window.__ENV.VITE_XAMAN_API_KEY (container-injected env)
   *   3. import.meta.env.VITE_XAMAN_API_KEY (Vite build-time)
   *
   * When all three resolve to empty, useWalletForXRP falls back to a
   * noop — the XRP picker still renders but connect() rejects with a
   * clear message instead of crashing the SDK.
   */
  xamanApiKey?: string
  children: ReactNode
}

/**
 * NonEVMProviders wraps its children with Solana + TonConnect + BTC
 * providers. Mount it INSIDE the wagmi provider so the order is:
 *
 *   WagmiProvider
 *     NonEVMProviders
 *       <bridge UI>
 *
 * BTC needs an explicit provider (BTCWalletProvider) because
 * sats-connect doesn't ship its own React Context — without it, the
 * WalletConnect dialog and the AssetInput row would each get their
 * own useState and the connect wouldn't propagate.
 */
export const NonEVMProviders: FC<NonEVMProvidersProps> = ({
  solanaRpcUrl = 'https://solana-rpc.publicnode.com',
  tonManifestUrl,
  xamanApiKey,
  children,
}) => {
  // Default to same-origin manifest so localhost, cloudflared/ngrok
  // tunnels, and prod each serve their own /tonconnect-manifest.json
  // without per-env config. SSR-safe: window is undefined → fall
  // back to the production canonical URL so the JSX render doesn't
  // throw before hydration.
  const resolvedManifestUrl =
    tonManifestUrl ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}/tonconnect-manifest.json`
      : 'https://bridge.lux.network/tonconnect-manifest.json')
  // autoConnect is intentionally OFF. With it on, returning users get
  // silently re-connected on page load — Phantom recognizes the site
  // as previously authorized and connects without a popup. The result:
  // clicking "Solana" sees sol.connected=true and resolves immediately,
  // closing the dialog with no visible feedback. Users report this as
  // "click does nothing, no popup."
  //
  // With autoConnect off: every fresh page load requires an explicit
  // click on "Solana" → Phantom popup → approve → connected. The
  // selected wallet name still persists via localStorage so the SDK
  // remembers which adapter to use; only the silent re-connect is
  // suppressed.
  // Resolve the Xaman API key with the documented precedence. When all
  // three sources are empty, the XRP provider still mounts but its
  // SDK init is a no-op; useWalletForXRP returns a Connect-rejects-
  // with-clear-message shape so the rest of the UI keeps rendering.
  const fromWindow =
    typeof window !== 'undefined'
      ? (window as unknown as { __ENV?: Record<string, string> }).__ENV?.[
          'VITE_XAMAN_API_KEY'
        ]
      : undefined
  const fromBuildEnv =
    typeof import.meta !== 'undefined'
      ? ((import.meta as unknown as { env?: Record<string, string> }).env?.[
          'VITE_XAMAN_API_KEY'
        ] as string | undefined)
      : undefined
  const resolvedXamanKey = xamanApiKey ?? fromWindow ?? fromBuildEnv ?? ''
  return (
    <ConnectionProvider endpoint={solanaRpcUrl}>
      <WalletProvider wallets={solanaWalletAdapters} autoConnect={false}>
        <TonConnectUIProvider manifestUrl={resolvedManifestUrl}>
          <BTCWalletProvider>
            <XRPWalletProvider apiKey={resolvedXamanKey}>{children}</XRPWalletProvider>
          </BTCWalletProvider>
        </TonConnectUIProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
