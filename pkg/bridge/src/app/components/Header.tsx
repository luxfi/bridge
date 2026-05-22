// Header — brand area + env/protocol chips + wallet connect.
//
// Reads brand metadata from the SDK config (which downstream consumers set
// once at mount time via setConfig). The env + MPC protocol chips make
// the active deploy target explicit so users can tell mainnet from testnet
// at a glance and ops can verify the post-quantum protocol is wired right.

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

const chipRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginLeft: 8,
}

const chipBase: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid var(--bridge-border)',
  color: 'var(--bridge-text-muted)',
  background: 'var(--bridge-bg-input)',
}

const envMainnet: CSSProperties = {
  ...chipBase,
  color: 'var(--bridge-success)',
  borderColor: 'rgba(76, 175, 80, 0.32)',
  background: 'rgba(76, 175, 80, 0.08)',
}

const envTestnet: CSSProperties = {
  ...chipBase,
  color: 'var(--bridge-accent)',
  borderColor: 'rgba(91, 141, 239, 0.32)',
  background: 'rgba(91, 141, 239, 0.08)',
}

const right: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

export const Header: FC<HeaderProps> = ({ wallet, defaultChainId }) => {
  // Safe read — getConfig() throws only if BridgeApp renders before setConfig;
  // the Bridge.tsx wrapper guarantees order, so we can read directly.
  const cfg = getConfig()
  const name = cfg.brand?.name ?? 'Bridge'
  const logo = cfg.brand?.logoUrl
  const initial = name.charAt(0).toUpperCase()
  const envStyle = cfg.env === 'mainnet' ? envMainnet : envTestnet
  const protocol = cfg.mpc?.protocol ?? 'cggmp21'
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
        <div style={chipRow}>
          <span style={envStyle} title={`Bridge environment: ${cfg.env}`}>
            {cfg.env}
          </span>
          <span style={chipBase} title={`MPC threshold protocol: ${protocol}`}>
            mpc · {protocol}
          </span>
        </div>
      </div>
      <div style={right}>
        <WalletConnect wallet={wallet} defaultChainId={defaultChainId} />
      </div>
    </header>
  )
}
