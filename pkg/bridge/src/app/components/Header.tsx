// Header — brand area + wallet connect.
//
// Reads brand metadata from the SDK config (which downstream consumers set
// once at mount time via setConfig). Phase 3 R2 swaps the styling layer.

import type { CSSProperties, FC } from 'react'
import { getConfig } from '../../config'
import type { WalletState } from '../hooks/useWallet'
import { WalletConnect } from './WalletConnect'

export interface HeaderProps {
  wallet: WalletState
  defaultChainId: string
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 20px',
  borderBottom: '1px solid var(--bridge-border)',
  background: 'var(--bridge-bg)',
  position: 'sticky',
  top: 0,
  zIndex: 10,
}

const brand: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const brandLogo: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background:
    'linear-gradient(135deg, var(--bridge-accent), var(--bridge-accent-hover))',
  color: 'white',
  fontSize: 14,
  fontWeight: 700,
}

const brandName: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
}

export const Header: FC<HeaderProps> = ({ wallet, defaultChainId }) => {
  // Safe read — getConfig() throws only if BridgeApp renders before setConfig;
  // the Bridge.tsx wrapper guarantees order, so we can read directly.
  const cfg = getConfig()
  const name = cfg.brand?.name ?? 'Bridge'
  const logo = cfg.brand?.logoUrl
  const initial = name.charAt(0).toUpperCase()
  return (
    <header style={header}>
      <div style={brand}>
        {logo ? (
          <img
            src={logo}
            alt={name}
            style={{ width: 28, height: 28, borderRadius: 6 }}
          />
        ) : (
          <span style={brandLogo} aria-hidden>
            {initial}
          </span>
        )}
        <span style={brandName}>{name}</span>
      </div>
      <WalletConnect wallet={wallet} defaultChainId={defaultChainId} />
    </header>
  )
}
