// TransferStatus — list of in-flight + recent transfers.
//
// Renders the transfer feed surfaced by useTransfers. Each row shows the
// phase as a colored dot + label. Phase 3 R2.5 swaps the layout containers
// onto `@hanzo/gui` stacks and the text leaves onto `Text`.

import type { CSSProperties, FC } from 'react'
import { Text, XStack, YStack } from '@hanzo/gui'
import type { Transfer, TransferPhase } from '../hooks/useTransfers'
import { DEFAULT_CHAINS, findChain } from '../lib/chains'
import { formatAmount } from '../lib/format'
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
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid var(--bridge-border)',
  fontSize: 13,
}

const dot: CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: 8,
}

function shortChainName(chainId: string): string {
  return findChain(DEFAULT_CHAINS, chainId)?.name ?? chainId
}

export const TransferStatus: FC<TransferStatusProps> = ({ transfers }) => (
  <Card>
    <Text style={heading}>Transfers</Text>
    {transfers.length === 0 ? (
      <Text style={empty}>No transfers yet. Submit a bridge above to start.</Text>
    ) : (
      <YStack>
        {transfers.map((t) => (
          <XStack key={t.id} style={row}>
            <YStack style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text>
                {formatAmount(t.inAmount, 6)} → {formatAmount(t.outAmount, 6)}
              </Text>
              <Text style={{ fontSize: 11, color: 'var(--bridge-text-muted)' }}>
                {shortChainName(t.fromChainId)} → {shortChainName(t.toChainId)}
              </Text>
            </YStack>
            <XStack style={{ display: 'flex', alignItems: 'center' }}>
              <Text
                style={{ ...dot, background: phaseColor[t.phase] }}
                aria-hidden
              />
              <Text style={{ color: phaseColor[t.phase] }}>
                {phaseLabel[t.phase]}
              </Text>
            </XStack>
          </XStack>
        ))}
      </YStack>
    )}
  </Card>
)
