// Header — the brand, which network this is, and the wallet.
//
// Reads brand metadata from the SDK config (which downstream consumers set
// once at mount time via setConfig). The environment chip stays because
// "am I on mainnet or testnet" is a fact a person needs before they send
// money. What the signing cluster runs is not: it names an internal protocol
// a user cannot act on, and a header is the one surface every visitor reads.

import type { CSSProperties, FC } from 'react'
import { getConfig } from '../../config'
import type { BridgeWallet } from '../hooks/useBridgeWallet'
import type { Chain } from '../lib/chains'
import { WalletConnect } from './WalletConnect'

export interface HeaderProps {
  /** Unified wallet (wagmi EVM + @luxwallet/connect non-EVM). */
  wallet: BridgeWallet
  /** Selected source chain — drives which wallet stack the connect targets. */
  fromChain: Chain
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: 'var(--bridge-header-padding-y) var(--bridge-header-padding-x)',
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
  minWidth: 0,
  flex: '0 1 auto',
}

const brandLogo: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bridge-bg-input)',
  border: '1px solid var(--bridge-border)',
  color: 'var(--bridge-text)',
  fontSize: 12,
  fontWeight: 600,
}

const brandName: CSSProperties = {
  fontSize: 'var(--bridge-brand-name-size)',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const chip: CSSProperties = {
  display: 'var(--bridge-chip-display)',
  alignItems: 'center',
  marginLeft: 4,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  padding: '3px 8px',
  borderRadius: 'var(--bridge-radius-pill)',
  border: '1px solid var(--bridge-border)',
  color: 'var(--bridge-text-muted)',
  background: 'var(--bridge-bg-soft)',
  whiteSpace: 'nowrap',
}

const chipLive: CSSProperties = {
  ...chip,
  color: 'var(--bridge-success)',
  borderColor: 'var(--bridge-success-border)',
  background: 'var(--bridge-success-soft)',
}

const right: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flex: '0 0 auto',
}

export const Header: FC<HeaderProps> = ({ wallet, fromChain }) => {
  // Safe read — getConfig() throws only if BridgeApp renders before setConfig;
  // the Bridge.tsx wrapper guarantees order, so we can read directly.
  const cfg = getConfig()
  const name = cfg.brand?.name ?? 'Bridge'
  const logo = cfg.brand?.logoUrl
  const initial = name.charAt(0).toUpperCase()
  const live = cfg.env === 'mainnet'
  return (
    <header style={header}>
      <div style={brand}>
        {logo ? (
          <img
            src={logo}
            alt=""
            style={{ width: 24, height: 24, borderRadius: 6 }}
          />
        ) : (
          <span style={brandLogo} aria-hidden>
            {initial}
          </span>
        )}
        <span style={brandName}>{name}</span>
        <span style={live ? chipLive : chip}>{cfg.env}</span>
      </div>
      <div style={right}>
        <WalletConnect wallet={wallet} fromChain={fromChain} />
      </div>
    </header>
  )
}
