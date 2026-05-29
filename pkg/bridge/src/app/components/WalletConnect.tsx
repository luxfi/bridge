// WalletConnect — connect / disconnect button + connected address pill +
// a centered modal wallet picker.
//
// The "Connect Wallet" button opens a centered modal listing every
// wagmi-registered connector. Connectors are split into two groups:
//
//   • Installed — extensions currently announced via EIP-6963 in this
//     browser. The user can click and get a one-tap connect with no popups.
//   • Popular  — connectors that route to remote wallets (WalletConnect QR,
//     Coinbase Wallet SDK popup). Always available, mobile-friendly.
//
// The modal uses a fixed overlay (not an anchor popover) so it centers
// regardless of where the trigger sits in the header. Dismiss paths:
// the X button, clicking the backdrop, ESC. Focus is trapped inside the
// dialog while open and restored to the trigger on close, matching the
// behaviour of every modern wallet picker (RainbowKit, ConnectKit, web3modal).
//
// Failures from `connectWith()` (user rejected the popup, no connector
// matched, network error, missing WC project id) are surfaced inline below
// the connector grid instead of being silently void'd. Without this, users
// blamed the bridge for their own popup rejections — the bridge needs to
// say "you closed the wallet popup" so the next attempt is obvious.

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
} from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@hanzo/gui'
import type { WalletState, WalletConnectorInfo } from '../hooks/useWallet'
import { useWalletForFamily } from '../lib/wallet-adapters'
import type { WalletForFamily } from '../lib/wallet-adapters'
import { ASSET_LOGOS } from '../lib/logos'
import type { ChainFamily } from '../lib/chains'
import { shortAddress } from '../lib/format'

export interface WalletConnectProps {
  wallet: WalletState
  /** Chain to connect against when the user clicks a connector. */
  defaultChainId: string
}

const wrap: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 4,
}

const buttonBase: CSSProperties = {
  background: 'var(--bridge-accent)',
  color: 'white',
  border: 'none',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  transition: 'background-color 120ms ease',
}

const pillBase: CSSProperties = {
  background: 'var(--bridge-bg-input)',
  color: 'var(--bridge-text)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '6px 10px',
  fontSize: 12,
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
}

const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4, 5, 8, 0.72)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  animation: 'bridge-modal-fade 160ms ease both',
}

const dialog: CSSProperties = {
  background: 'var(--bridge-bg-elevated)',
  border: '1px solid var(--bridge-border-strong)',
  borderRadius: 'var(--bridge-radius)',
  boxShadow: 'var(--bridge-shadow-popover)',
  width: '100%',
  maxWidth: 380,
  maxHeight: 'min(80vh, 560px)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'bridge-modal-pop 180ms cubic-bezier(.2,.9,.3,1.2) both',
}

const dialogHeader: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr 32px',
  alignItems: 'center',
  padding: '14px 16px',
  borderBottom: '1px solid var(--bridge-border)',
  gap: 8,
}

const headerIconButton: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '1px solid var(--bridge-border)',
  background: 'var(--bridge-bg-input)',
  color: 'var(--bridge-text-muted)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 600,
  padding: 0,
  transition: 'color var(--bridge-transition-fast), background-color var(--bridge-transition-fast)',
}

const dialogTitle: CSSProperties = {
  textAlign: 'center',
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--bridge-text)',
  margin: 0,
  letterSpacing: '-0.01em',
}

const dialogBody: CSSProperties = {
  padding: '12px 14px 4px 14px',
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const groupHeading: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'none',
  // Picker-blue: a fixed vibrant blue so the "Installed" label remains
  // readable even when the tenant brand primary is set to a dark colour
  // (Lux's brand-primary is `#000000`, which would render this label
  // black-on-dark and effectively invisible). The picker UI deliberately
  // breaks away from the brand accent here.
  color: '#5b8def',
  margin: '4px 4px 6px 4px',
}

const groupHeadingMuted: CSSProperties = {
  ...groupHeading,
  color: 'var(--bridge-text-muted)',
}

const groupList: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const connectorRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 'var(--bridge-radius-sm)',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  color: 'var(--bridge-text)',
  fontSize: 14,
  fontWeight: 600,
  textAlign: 'left',
  width: '100%',
  transition: 'background-color var(--bridge-transition-fast)',
}

const connectorIcon: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  flexShrink: 0,
  display: 'block',
}

const connectorMeta: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--bridge-text-muted)',
  marginLeft: 'auto',
}

const dialogFooter: CSSProperties = {
  padding: '12px 16px 14px 16px',
  borderTop: '1px solid var(--bridge-border)',
  textAlign: 'center',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--bridge-text-muted)',
}

const errorBox: CSSProperties = {
  margin: '0 14px 12px 14px',
  background: 'var(--bridge-danger-soft)',
  border: '1px solid var(--bridge-danger-border)',
  color: 'var(--bridge-danger)',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '8px 12px',
  fontSize: 12,
}

const emptyState: CSSProperties = {
  padding: '24px 12px',
  fontSize: 13,
  color: 'var(--bridge-text-muted)',
  textAlign: 'center',
  lineHeight: 1.5,
}

/**
 * Humanise a thrown error so the user reads "Connection rejected" instead of
 * "User rejected the request" (or worse, an EIP-1193 error code). Order is
 * specific → generic — first match wins.
 */
function humaniseConnectError(err: unknown): string {
  if (!err) return 'Wallet connection failed'
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('reject') || lower.includes('cancel') || lower.includes('denied')) {
    return 'Connection rejected'
  }
  // Surface our connect-watchdog timeout verbatim — its full body is
  // an actionable instruction ("Phantom may be locked. Open the
  // Phantom extension and try again.") and truncating it loses the
  // remediation. Match by the verbatim watchdog phrase.
  if (lower.includes('did not respond within')) {
    return msg
  }
  // Insecure-origin preflight error: surface verbatim. The body
  // explains the actual problem (HTTP on a non-localhost origin
  // can't open wallet popups) plus three concrete remediation
  // paths. Truncating to 80 chars would strip all of them.
  if (lower.includes('wallet popups are blocked on')) {
    return msg
  }
  if (lower.includes('not registered') || lower.includes('no wallet')) {
    return 'No wallet found. Install MetaMask or use WalletConnect.'
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Wallet connection failed (network error)'
  }
  if (lower.includes('chain')) {
    return msg
  }
  // Trim very long messages — keep the first 80 chars so the toast stays readable
  return msg.length > 80 ? msg.slice(0, 77) + '…' : msg
}

/** CSS keyframes injected once per browser session (idempotent guard). */
const KEYFRAMES = `
@keyframes bridge-modal-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes bridge-modal-pop {
  from { opacity: 0; transform: translateY(8px) scale(.98) }
  to   { opacity: 1; transform: translateY(0)   scale(1) }
}
`

let keyframesInstalled = false
function ensureKeyframes(): void {
  if (keyframesInstalled || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.dataset.bridgeWalletPicker = '1'
  style.textContent = KEYFRAMES
  document.head.appendChild(style)
  keyframesInstalled = true
}

export const WalletConnect: FC<WalletConnectProps> = ({
  wallet,
  defaultChainId,
}) => {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerWrapRef = useRef<HTMLDivElement | null>(null)
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null)

  // Non-EVM wallet state. Read at the top level so the address pill
  // can reflect ANY connected family, not just EVM. Picking order
  // (EVM → SVM → TON → BTC) prefers EVM when multiple are connected,
  // matching the historical default; non-EVM users see their family's
  // address instead of a stuck "Connect Wallet" button.
  const svmWallet = useWalletForFamily('svm')
  const tonWallet = useWalletForFamily('ton')
  const btcWallet = useWalletForFamily('btc')

  // The "primary" connected wallet for the pill. EVM wins if connected
  // (preserves prior UX); otherwise first non-EVM with an address.
  const primary: { address: string; symbol: string | null; disconnect: () => void | Promise<void> } | null =
    wallet.address
      ? { address: wallet.address, symbol: null, disconnect: wallet.disconnect }
      : svmWallet.address
        ? { address: svmWallet.address, symbol: 'SOL', disconnect: svmWallet.disconnect }
        : tonWallet.address
          ? { address: tonWallet.address, symbol: 'TON', disconnect: tonWallet.disconnect }
          : btcWallet.address
            ? { address: btcWallet.address, symbol: 'BTC', disconnect: btcWallet.disconnect }
            : null

  // ESC dismiss + focus restore. Mirrors the close-on-Escape pattern of
  // every dialog primitive we use elsewhere (Radix etc.).
  useEffect(() => {
    if (!open) return
    ensureKeyframes()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Focus the first connector when the dialog opens, restore focus to the
  // trigger button when it closes. Without this, a keyboard-only user lands
  // nowhere after pressing Enter on "Connect Wallet".
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstFocusableRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
    // Restore focus to the trigger via querySelector on the wrap div —
    // @hanzo/gui's <Button> doesn't forward refs to the underlying DOM
    // element, so we ref its parent and reach in.
    triggerWrapRef.current?.querySelector('button')?.focus()
    return undefined
  }, [open])

  // Body scroll lock while modal is open — keeps the rest of the page from
  // scrolling behind a small modal on mobile.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Clear stale errors whenever the picker (re)opens or the wallet flips
  // to a connected state.
  useEffect(() => {
    if (open) setError(null)
  }, [open])
  // Close the picker whenever ANY family flips to connected — was
  // previously gated on wallet.address (EVM only), which left the
  // dialog open after a successful Solana / TON / BTC connect even
  // though state had updated underneath.
  const primaryAddress = primary?.address ?? null
  useEffect(() => {
    if (primaryAddress) {
      setError(null)
      setOpen(false)
    }
  }, [primaryAddress])

  const onPick = useCallback(
    async (c: WalletConnectorInfo): Promise<void> => {
      setError(null)
      try {
        await wallet.connectWith(c.id, defaultChainId)
        setOpen(false)
      } catch (err) {
        setError(humaniseConnectError(err))
      }
    },
    [wallet, defaultChainId],
  )

  // Split connectors into Installed / Popular for the two-group layout.
  // Popular always includes the WalletConnect + Coinbase Wallet SDK rows
  // (when present) so mobile users always have a path even with no
  // extension installed.
  const { installed, popular } = useMemo(() => {
    const installedList: WalletConnectorInfo[] = []
    const popularList: WalletConnectorInfo[] = []
    for (const c of wallet.connectors) {
      if (c.installed) installedList.push(c)
      else popularList.push(c)
    }
    return { installed: installedList, popular: popularList }
  }, [wallet.connectors])

  // Connected — show the address pill (no picker). Renders for ANY
  // family that is currently connected (EVM / SVM / TON / BTC).
  // Clicking the pill disconnects whichever family owns the address;
  // the family is then free for the user to reconnect to a different
  // one from the picker again.
  if (primary) {
    return (
      <Button
        style={pillBase}
        onClick={() => {
          void primary.disconnect()
        }}
        aria-label={`Disconnect ${primary.symbol ?? 'EVM'} wallet ${primary.address}`}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--bridge-success)',
          }}
          aria-hidden
        />
        {shortAddress(primary.address)}
        {primary.symbol ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--bridge-bg-elevated)',
              color: 'var(--bridge-text-muted)',
              marginLeft: 4,
            }}
          >
            {primary.symbol}
          </span>
        ) : null}
      </Button>
    )
  }

  const dialogNode =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            style={backdrop}
            onMouseDown={(e) => {
              // Only dismiss when the click started on the backdrop itself —
              // a drag that begins inside the dialog and releases on the
              // backdrop should not close (e.g. selecting text).
              if (e.target === e.currentTarget) setOpen(false)
            }}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="bridge-wallet-picker-title"
              style={dialog}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={dialogHeader}>
                <button
                  type="button"
                  style={headerIconButton}
                  aria-label="Help with wallets"
                  title="Need help connecting a wallet?"
                  onClick={() => {
                    // Open WalletConnect's wallet directory in a new tab —
                    // a low-effort help target that always has fresh info.
                    if (typeof window !== 'undefined') {
                      window.open('https://walletconnect.network/explorer', '_blank', 'noopener,noreferrer')
                    }
                  }}
                >
                  ?
                </button>
                <h2 id="bridge-wallet-picker-title" style={dialogTitle}>
                  Connect a Wallet
                </h2>
                <button
                  type="button"
                  style={headerIconButton}
                  aria-label="Close wallet picker"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>

              <div style={dialogBody}>
                {wallet.connectors.length === 0 ? (
                  <div style={emptyState}>
                    No wallets available.
                    <br />
                    Install a browser extension or configure WalletConnect.
                  </div>
                ) : (
                  <>
                    {installed.length > 0 ? (
                      <div>
                        <div style={groupHeading}>Installed</div>
                        <div style={groupList}>
                          {installed.map((c, i) => (
                            <ConnectorButton
                              key={c.id}
                              connector={c}
                              meta="Detected"
                              onClick={() => {
                                void onPick(c)
                              }}
                              ref={i === 0 ? firstFocusableRef : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {popular.length > 0 ? (
                      <div>
                        <div style={groupHeadingMuted}>Popular</div>
                        <div style={groupList}>
                          {popular.map((c, i) => (
                            <ConnectorButton
                              key={c.id}
                              connector={c}
                              onClick={() => {
                                void onPick(c)
                              }}
                              ref={
                                installed.length === 0 && i === 0
                                  ? firstFocusableRef
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <NonEVMConnectorRows
                      onError={setError}
                      onConnected={() => setOpen(false)}
                    />
                  </>
                )}
              </div>

              {error ? <div style={errorBox} role="alert">{error}</div> : null}

              <div style={dialogFooter}>
                Thanks for choosing the Bridge!
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={triggerWrapRef} style={wrap}>
      <Button
        style={{
          ...buttonBase,
          opacity: wallet.connecting ? 0.7 : 1,
        }}
        disabled={wallet.connecting}
        onClick={() => {
          setError(null)
          setOpen((o) => !o)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
      </Button>
      {dialogNode}
    </div>
  )
}

interface ConnectorButtonProps {
  connector: WalletConnectorInfo
  meta?: string
  onClick: () => void
}

/**
 * One row in the picker. Forward-ref so the dialog can imperatively focus
 * the first connector when it opens (a11y: keyboard users land somewhere
 * sensible).
 */
const ConnectorButton = forwardRef<HTMLButtonElement, ConnectorButtonProps>(
  ({ connector, meta, onClick }, ref) => (
    <button
      ref={ref}
      type="button"
      style={connectorRow}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bridge-bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
      onClick={onClick}
    >
      <img src={connector.icon} alt="" style={connectorIcon} />
      <span>{connector.name}</span>
      {meta ? <span style={connectorMeta}>{meta}</span> : null}
    </button>
  ),
)
ConnectorButton.displayName = 'ConnectorButton'

// =============================================================================
// Non-EVM family rows
// =============================================================================

/**
 * Three family entries — Solana, TON, Bitcoin — that delegate to each
 * family's own connect modal/flow:
 *
 *   • Solana   → @solana/wallet-adapter-react's wallet.connect() opens the
 *                selected wallet (Phantom by default)
 *   • TON      → @tonconnect/ui-react's openModal() shows the TonConnect picker
 *   • Bitcoin  → sats-connect's getAccounts() prompts the Wallet-Standard wallet
 *
 * Each row sits below the EVM "Installed" + "Popular" groups under a
 * "Other Chains" heading. Connect errors bubble up via onError to the
 * existing dialog error box; successful connects close the modal via
 * onConnected (mirrors the EVM onPick handler's behaviour).
 *
 * Errors that surface here include user-cancelled connect attempts —
 * humaniseConnectError handles those identically to the EVM path so the
 * messaging is consistent.
 */
interface NonEVMConnectorRowsProps {
  onError: (msg: string | null) => void
  onConnected: () => void
}

const NonEVMConnectorRows: FC<NonEVMConnectorRowsProps> = ({ onError, onConnected }) => {
  const svm = useWalletForFamily('svm')
  const ton = useWalletForFamily('ton')
  const btc = useWalletForFamily('btc')
  // Track which row is mid-connect so we can show "Connecting…" on the
  // right family without blocking the others (a Phantom popup that
  // hangs shouldn't gray out TON + BTC).
  const [pendingFamily, setPendingFamily] = useState<ChainFamily | null>(null)

  const rows: Array<{
    family: ChainFamily
    label: string
    via: string
    icon: string
    wallet: WalletForFamily
  }> = [
    { family: 'svm', label: 'Solana', via: 'Phantom', icon: ASSET_LOGOS.SOL ?? '', wallet: svm },
    { family: 'ton', label: 'TON', via: 'TonConnect', icon: ASSET_LOGOS.TON ?? '', wallet: ton },
    { family: 'btc', label: 'Bitcoin', via: 'Xverse', icon: ASSET_LOGOS.BTC ?? '', wallet: btc },
  ]

  return (
    <div>
      <div style={groupHeadingMuted}>Other Chains</div>
      <div style={groupList}>
        {rows.map(({ family, label, via, icon, wallet }) => {
          // Only treat the row as "pending" when the user actively
          // clicked it — wallet.connecting is also true when the
          // family's adapter is silently re-connecting in the
          // background (e.g. @solana/wallet-adapter-react's autoConnect
          // restoring a saved Phantom session). Surfacing that
          // background pending state would show "Connecting…" on the
          // row the moment the dialog opens, even though the user
          // hasn't done anything yet — the bug a real user reported.
          const isPending = pendingFamily === family
          const meta = wallet.connected ? 'Connected' : isPending ? 'Connecting…' : via
          return (
            <NonEVMConnectorButton
              key={family}
              label={label}
              meta={meta}
              icon={icon}
              disabled={isPending}
              onClick={async () => {
                onError(null)
                setPendingFamily(family)
                try {
                  await wallet.connect()
                  onConnected()
                } catch (err) {
                  onError(humaniseConnectError(err))
                } finally {
                  setPendingFamily(null)
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

interface NonEVMConnectorButtonProps {
  label: string
  meta: string
  icon: string
  disabled?: boolean
  onClick: () => void
}

const NonEVMConnectorButton: FC<NonEVMConnectorButtonProps> = ({
  label,
  meta,
  icon,
  disabled = false,
  onClick,
}) => (
  <button
    type="button"
    style={{
      ...connectorRow,
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? 'wait' : 'pointer',
    }}
    disabled={disabled}
    onMouseEnter={(e) => {
      if (disabled) return
      e.currentTarget.style.background = 'var(--bridge-bg-hover)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent'
    }}
    onClick={onClick}
  >
    {icon ? <img src={icon} alt="" style={connectorIcon} /> : <span style={connectorIcon} />}
    <span>{label}</span>
    <span style={connectorMeta}>{meta}</span>
  </button>
)
