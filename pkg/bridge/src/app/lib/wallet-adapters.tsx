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

import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet as useSolanaWalletInternal,
} from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import type { Adapter } from '@solana/wallet-adapter-base'
import { PublicKey, type Connection } from '@solana/web3.js'
import { getWallets as getStandardWallets } from '@wallet-standard/app'
import type { Wallet as StandardWallet } from '@wallet-standard/base'
import {
  TonConnectUIProvider,
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from '@tonconnect/ui-react'
import { useAccount, useBalance, useConnect, useDisconnect } from 'wagmi'

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
// TON
// =============================================================================

function useWalletForTON(): WalletForFamily {
  const address = useTonAddress()
  const wallet = useTonWallet()
  const [tonConnectUI] = useTonConnectUI()
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
      await tonConnectUI.openModal()
    },
    disconnect: async () => {
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
  const url = `https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`toncenter HTTP ${r.status}`)
  const j = (await r.json()) as { ok: boolean; result: string }
  if (!j.ok) throw new Error('toncenter: ok=false')
  return Number(j.result)
}

// =============================================================================
// Bitcoin (sats-connect)
// =============================================================================

function useWalletForBTC(): WalletForFamily {
  const [address, setAddress] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const sats = await import('sats-connect')
      // sats-connect v4: provider request API
      const resp = await sats.default.request('getAccounts', {
        purposes: ['payment'],
        message: 'Connect to the Lux Bridge',
      } as never)
      if (resp.status !== 'success') {
        throw new Error(`sats-connect status=${resp.status}`)
      }
      // getAccounts returns { result: [{ address, addressType, publicKey, purpose }] }
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

async function readBtcBalance(address: string): Promise<number> {
  // mempool.space GET /api/address/<addr>
  // Returns { chain_stats: { funded_txo_sum, spent_txo_sum, ... }, ... }
  // Balance = funded - spent.
  const url = `https://mempool.space/api/address/${encodeURIComponent(address)}`
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
    case 'cardano':
    case 'substrate':
    default:
      return noopWallet(family, family === 'xrp' ? 'XRP' : family === 'cardano' ? 'ADA' : 'DOT')
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
   * manifest at a public URL describing the app. When omitted, we
   * point at the Lux Bridge canonical manifest; tenants should
   * override with their own manifest URL for proper branding.
   */
  tonManifestUrl?: string
  children: ReactNode
}

/**
 * NonEVMProviders wraps its children with Solana + TonConnect
 * providers. Mount it INSIDE the wagmi provider so the order is:
 *
 *   WagmiProvider
 *     NonEVMProviders
 *       <bridge UI>
 *
 * BTC has no provider — sats-connect is invoked imperatively per
 * connect() call.
 */
export const NonEVMProviders: FC<NonEVMProvidersProps> = ({
  solanaRpcUrl = 'https://solana-rpc.publicnode.com',
  tonManifestUrl = 'https://bridge.lux.network/tonconnect-manifest.json',
  children,
}) => {
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
  return (
    <ConnectionProvider endpoint={solanaRpcUrl}>
      <WalletProvider wallets={solanaWalletAdapters} autoConnect={false}>
        <TonConnectUIProvider manifestUrl={tonManifestUrl}>
          {children}
        </TonConnectUIProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
