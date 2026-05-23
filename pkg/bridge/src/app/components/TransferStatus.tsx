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
  signing: 'Signing (MPC threshold)',
  broadcasting: 'Broadcasting',
  completed: 'Completed',
  failed: 'Failed',
}

const phaseColor: Record<TransferPhase, string> = {
  pending: 'var(--bridge-text-muted)',
  signing: 'var(--bridge-accent)',
  broadcasting: 'var(--bridge-accent-hover)',
  completed: 'var(--bridge-success)',
  failed: 'var(--bridge-danger)',
}

const heading: CSSProperties = {
  fontSize: 12,
  color: 'var(--bridge-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
}

const empty: CSSProperties = {
  fontSize: 12,
  color: 'var(--bridge-text-subtle)',
  fontStyle: 'italic',
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

const mpcLine: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: 'var(--bridge-text-muted)',
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
}

const badgeRow: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
}

const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 6px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderRadius: 4,
  background: 'rgba(91, 141, 239, 0.12)',
  color: 'var(--bridge-accent)',
  border: '1px solid rgba(91, 141, 239, 0.32)',
}

const depositPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 10,
  background: 'var(--bridge-accent-soft)',
  border: '1px solid var(--bridge-accent-border)',
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
  color: 'var(--bridge-accent)',
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
      title: `Layered cosign — Utila vault ${cfg.mpc.utila.vaultId ?? cfg.mpc.utila.orgId}`,
    })
  }
  if (cfg.mpc?.fireblocks) {
    cosignerBadges.push({
      label: 'Fireblocks',
      title: `Layered cosign — Fireblocks vault ${cfg.mpc.fireblocks.vaultAccountId ?? cfg.mpc.fireblocks.apiKey}`,
    })
  }

  return (
    <Card>
      <div style={heading}>Transfers</div>
      {transfers.length === 0 ? (
        <div style={empty}>No transfers yet. Submit a bridge above to start.</div>
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

              {t.mpc ? (
                <div style={mpcLine}>
                  <span style={badge} title={`MPC protocol ${t.mpc.protocol}`}>
                    {t.mpc.protocol}
                  </span>
                  <span>
                    {t.mpc.sessionId === 'aborted'
                      ? 'session aborted'
                      : shortAddress(t.mpc.sessionId, 6, 4)}
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
                  <span style={badge} title="Native Lux MPC threshold sign">
                    Native MPC
                  </span>
                  {cosignerBadges.map((b) => (
                    <span key={b.label} style={badge} title={b.title}>
                      + {b.label}
                    </span>
                  ))}
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
