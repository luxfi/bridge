// WalletConnect — connect / disconnect button + connected address pill.
//
// Today this stubs the connection (see useWallet.ts). Phase 3 R3 wires
// the real threshold-MPC session — the *button* contract here stays.

import type { CSSProperties, FC } from 'react'
import type { WalletState } from '../hooks/useWallet'
import { shortAddress } from '../lib/format'

export interface WalletConnectProps {
  wallet: WalletState
  /** Chain to connect against when the user clicks "Connect". */
  defaultChainId: string
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

export const WalletConnect: FC<WalletConnectProps> = ({
  wallet,
  defaultChainId,
}) => {
  if (!wallet.address) {
    return (
      <button
        type="button"
        style={{
          ...buttonBase,
          opacity: wallet.connecting ? 0.7 : 1,
        }}
        disabled={wallet.connecting}
        onClick={() => {
          void wallet.connect(defaultChainId)
        }}
      >
        {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    )
  }
  return (
    <button
      type="button"
      style={pillBase}
      onClick={wallet.disconnect}
      title="Disconnect wallet"
      aria-label={`Disconnect wallet ${wallet.address}`}
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
      {shortAddress(wallet.address)}
    </button>
  )
}
