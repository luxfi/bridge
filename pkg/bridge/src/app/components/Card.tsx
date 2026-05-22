// Card primitive — a styled container.
//
// Phase 3 R2 will replace this with @hanzo/gui's `Card`. The wrapper exists
// so the swap is mechanical: every call site uses `<Card>` and Phase 3 only
// touches this one file.

import type { CSSProperties, FC, ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  style?: CSSProperties
  /** Skip default padding (caller provides its own). */
  bare?: boolean
}

const base: CSSProperties = {
  background: 'var(--bridge-bg-elevated)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius)',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  boxShadow: 'var(--bridge-shadow-card)',
}

export const Card: FC<CardProps> = ({ children, style, bare }) => (
  <div
    style={{
      ...base,
      ...(bare ? { padding: 0 } : null),
      ...style,
    }}
  >
    {children}
  </div>
)
