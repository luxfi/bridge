// TransferStatus — list of in-flight + recent transfers.
//
// Renders the transfer feed surfaced by useTransfers. Each row shows the
// phase as a colored dot + label, plus — when populated by the backend —
// the live MPC threshold session (id / protocol / status / error) so the
// "Signing" phase is more than a static label. When the tenant config
// declares layered cosigners (`cfg.mpc.utila` / `cfg.mpc.fireblocks`),
// each row gets a small badge so users see the 2-of-2 surface their
// settlement is gated on.

import type { CSSProperties, FC } from 'react'
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
