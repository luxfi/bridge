// TransferStatus — list of in-flight + recent transfers.
//
// Renders the transfer feed surfaced by useTransfers. Each row shows the
// phase as a colored dot + label, plus — when populated by the backend —
// the live MPC threshold session (id / protocol / status / error) so the
// "Signing" phase is more than a static label. When the tenant config
// declares layered cosigners (`cfg.mpc.utila` / `cfg.mpc.fireblocks`),
// each row gets a small badge so users see the 2-of-2 surface their
// settlement is gated on.
//
// Deposit-address mode (non-EVM source chains): when `transfer.depositAddress`
// is populated, a prominent panel appears with the address + amount + copy
// button so the user can pay from any wallet. Without this, the user would
// click "Generate deposit address" and have nowhere to copy from.

import { useCallback, useState, type CSSProperties, type FC } from 'react'
import { getConfig } from '../../config'
import type { Transfer, TransferPhase } from '../hooks/useTransfers'
import { useNetworks } from '../hooks/useNetworks'
import { findChain } from '../lib/chains'
import { formatAmount, shortAddress } from '../lib/format'
import { Card } from './Card'

export interface TransferStatusProps {
  transfers: Transfer[]
}

const phaseLabel: Record<TransferPhase, string> = {
  pending: 'Pending',
  signing: 'Approving release',
  broadcasting: 'Broadcasting',
  completed: 'Completed',
  refunding: 'Refunding',
  refunded: 'Refunded',
  failed: 'Failed',
}

const phaseColor: Record<TransferPhase, string> = {
  pending: 'var(--bridge-text-muted)',
  signing: 'var(--bridge-text)',
  broadcasting: 'var(--bridge-text)',
  completed: 'var(--bridge-success)',
  // Refund phases sit between "still working" and "done" — render in a
  // warning hue so users can tell they got their funds back but the
  // intended swap didn't complete. Distinct from completed (green) and
  // failed (red).
  refunding: 'var(--bridge-warning, #b45309)',
  refunded: 'var(--bridge-warning, #b45309)',
  failed: 'var(--bridge-danger)',
}

const empty: CSSProperties = {
  fontSize: 'var(--bridge-body-size)',
  lineHeight: 1.55,
  color: 'var(--bridge-text-subtle)',
}

const row: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 0',
  borderBottom: '1px solid var(--bridge-border)',
  fontSize: 13,
}

const rowTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const dot: CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: 8,
}

const sessionLine: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  fontSize: 'var(--bridge-note-size)',
  color: 'var(--bridge-text-subtle)',
  fontFamily: 'var(--bridge-font-mono)',
}

const badgeRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
}

const badgeNote: CSSProperties = {
  fontSize: 'var(--bridge-note-size)',
  color: 'var(--bridge-text-subtle)',
}

const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 'var(--bridge-radius-pill)',
  background: 'var(--bridge-bg-soft)',
  color: 'var(--bridge-text-muted)',
  border: '1px solid var(--bridge-border)',
}

const depositPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 10,
  background: 'var(--bridge-bg-soft)',
  border: '1px solid var(--bridge-border-strong)',
  borderRadius: 'var(--bridge-radius-md)',
}

const depositHeading: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--bridge-text)',
}

const depositAddressRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  background: 'var(--bridge-bg-input)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-sm)',
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 12,
  color: 'var(--bridge-text)',
  wordBreak: 'break-all',
}

const copyBtn: CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  background: 'var(--bridge-bg-elevated)',
  color: 'var(--bridge-text)',
  border: '1px solid var(--bridge-border-strong)',
  borderRadius: 'var(--bridge-radius-sm)',
  padding: '4px 8px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
}

const depositHint: CSSProperties = {
  fontSize: 11,
  color: 'var(--bridge-text-muted)',
}

/**
 * Deposit-address row with a copy button. Renders only when the transfer
 * carries a `depositAddress` (non-EVM source flow). Copy uses the modern
 * Clipboard API with a one-shot "Copied" confirmation.
 */
const DepositPanel: FC<{ transfer: Transfer; fromChainName: string }> = ({
  transfer,
  fromChainName,
}) => {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(async () => {
    if (!transfer.depositAddress) return
    try {
      await navigator.clipboard.writeText(transfer.depositAddress)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (insecure context, old browser) — the
      // address is still visible and selectable for manual copy.
    }
  }, [transfer.depositAddress])
  return (
    <div style={depositPanel}>
      <div style={depositHeading}>
        <span>Send deposit</span>
        <span style={{ fontWeight: 500, color: 'var(--bridge-text-muted)' }}>
          {formatAmount(transfer.inAmount, 6)} on {fromChainName}
        </span>
      </div>
      <div style={depositAddressRow}>
        <span>{transfer.depositAddress}</span>
        <button type="button" style={copyBtn} onClick={() => void onCopy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div style={depositHint}>
        Send exactly{' '}
        <strong style={{ color: 'var(--bridge-text)' }}>
          {formatAmount(transfer.inAmount, 6)}
        </strong>{' '}
        from any {fromChainName} wallet to this address. The bridge will
        detect the deposit and complete the transfer.
      </div>
    </div>
  )
}

export const TransferStatus: FC<TransferStatusProps> = ({ transfers }) => {
  const cfg = getConfig()
  const { chains } = useNetworks()

  const shortChainName = (chainId: string): string =>
    findChain(chains, chainId)?.name ?? chainId

  const cosignerBadges: { label: string; title: string }[] = []
  if (cfg.mpc?.utila) {
    cosignerBadges.push({
      label: 'Utila',
      title: 'Utila must also approve the release',
    })
  }
  if (cfg.mpc?.fireblocks) {
    cosignerBadges.push({
      label: 'Fireblocks',
      title: 'Fireblocks must also approve the release',
    })
  }

  return (
    <Card title="Transfers">
      {transfers.length === 0 ? (
        <div style={empty}>
          Nothing yet. A crossing you start appears here and stays until it
          settles or is refunded.
        </div>
      ) : (
        <div>
          {transfers.map((t) => (
            <div key={t.id} style={row}>
              <div style={rowTop}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>
                    {formatAmount(t.inAmount, 6)} → {formatAmount(t.outAmount, 6)}
                  </span>
                  <span
                    style={{ fontSize: 11, color: 'var(--bridge-text-muted)' }}
                  >
                    {shortChainName(t.fromChainId)} → {shortChainName(t.toChainId)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{ ...dot, background: phaseColor[t.phase] }}
                    aria-hidden
                  />
                  <span style={{ color: phaseColor[t.phase] }}>
                    {phaseLabel[t.phase]}
                  </span>
                </div>
              </div>

              {t.depositAddress && t.phase !== 'completed' && t.phase !== 'failed' ? (
                <DepositPanel transfer={t} fromChainName={shortChainName(t.fromChainId)} />
              ) : null}

              {/*
                 The release reference and where it has got to. The session id
                 is here because it is what support asks for; which protocol
                 the signers ran is not something a person can act on, so it
                 is not drawn.
                 */}
              {t.mpc ? (
                <div style={sessionLine}>
                  <span>
                    {t.mpc.sessionId === 'aborted'
                      ? 'Release cancelled'
                      : `Ref ${shortAddress(t.mpc.sessionId, 6, 4)}`}
                  </span>
                  <span style={{ color: phaseColor[t.phase] }}>
                    · {t.mpc.status}
                  </span>
                  {t.mpc.error ? (
                    <span style={{ color: 'var(--bridge-danger)' }}>
                      · {t.mpc.error}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {cosignerBadges.length > 0 ? (
                <div style={badgeRow}>
                  <span style={badge}>Lux</span>
                  {cosignerBadges.map((b) => (
                    <span key={b.label} style={badge} title={b.title}>
                      + {b.label}
                    </span>
                  ))}
                  <span style={badgeNote}>both must approve the release</span>
                </div>
              ) : null}

              {/*
                 Transient retryable error from the bridge — shown only
                 while the swap is still progressing. Distinct visually
                 from `t.error` (terminal failure, red): rendered as a
                 warning banner so the user knows what to fix (e.g.
                 "Insufficient funds in release address") without
                 thinking the swap has actually died.
                 */}
              {t.lastError && t.phase !== 'failed' && t.phase !== 'completed' && t.phase !== 'refunded' ? (
                <div
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    marginTop: 4,
                    borderRadius: 4,
                    color: 'var(--bridge-warning, #b45309)',
                    background: 'var(--bridge-warning-bg, rgba(245, 158, 11, 0.08))',
                    border: '1px solid var(--bridge-warning-border, rgba(245, 158, 11, 0.25))',
                  }}
                >
                  ⏳ {t.lastError} — bridge is retrying
                </div>
              ) : null}

              {/*
                 Refund-state banner. While refunding: tell the user the
                 bridge is sweeping their deposit back. After refunded:
                 surface the source-chain tx hash so they can verify
                 receipt on the explorer. Distinct from the standard
                 lastError banner because this is a final-disposition
                 state rather than transient retry signal.
                 */}
              {t.phase === 'refunding' ? (
                <div
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    marginTop: 4,
                    borderRadius: 4,
                    color: 'var(--bridge-warning, #b45309)',
                    background: 'var(--bridge-warning-bg, rgba(245, 158, 11, 0.08))',
                    border: '1px solid var(--bridge-warning-border, rgba(245, 158, 11, 0.25))',
                  }}
                >
                  ↩ Auto-reverting: destination release couldn't land, sweeping deposit back to sender
                </div>
              ) : null}

              {t.phase === 'refunded' && t.refundTxHash ? (
                <div
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    marginTop: 4,
                    borderRadius: 4,
                    color: 'var(--bridge-warning, #b45309)',
                    background: 'var(--bridge-warning-bg, rgba(245, 158, 11, 0.08))',
                    border: '1px solid var(--bridge-warning-border, rgba(245, 158, 11, 0.25))',
                  }}
                >
                  ↩ Refunded — source funds returned to sender · tx{' '}
                  {shortAddress(t.refundTxHash, 6, 4)}
                </div>
              ) : null}

              {t.error ? (
                <div style={{ fontSize: 11, color: 'var(--bridge-danger)' }}>
                  {t.error}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
