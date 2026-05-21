// Card primitive — Tamagui-backed container.
//
// Phase 3 R2.5 swaps the inner `<div>` to `@hanzo/gui`'s `Card` (a styled
// YStack with brand-aware background + radius variants). The inline-style
// API stays so every call site is mechanically unchanged; downstream
// consumers can lift these into theme tokens once the GuiProvider is
// wired into BridgeApp (Phase 3 R3).

import type { CSSProperties, FC, ReactNode } from 'react'
import { Card as GuiCard } from '@hanzo/gui'

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
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

export const Card: FC<CardProps> = ({ children, style, bare }) => (
  <GuiCard
    unstyled
    style={{
      ...base,
      ...(bare ? { padding: 0 } : null),
      ...style,
    }}
  >
    {children}
  </GuiCard>
)
