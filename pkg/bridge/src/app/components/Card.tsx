// A panel — a bordered region with a name on it.
//
// The name is part of the panel rather than a heading each caller draws for
// itself, because a page of panels where one is titled at 16px and the next at
// 18px reads as two designs. `title` also gives the region a heading a screen
// reader can jump to, which a bare div with a styled span does not.
//
// Nothing here casts a shadow. The panels sit on the page, and an edge one
// pixel wide does the separating.

import type { CSSProperties, FC, ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  /** What this panel is. Drawn as its heading and read as its region name. */
  title?: string
  style?: CSSProperties
  /** Skip default padding (caller provides its own). */
  bare?: boolean
}

const base: CSSProperties = {
  background: 'var(--bridge-bg-elevated)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius)',
  padding: 'var(--bridge-card-padding)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--bridge-card-gap)',
}

const heading: CSSProperties = {
  margin: 0,
  fontSize: 'var(--bridge-panel-title-size)',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'var(--bridge-text)',
}

export const Card: FC<CardProps> = ({ children, title, style, bare }) => (
  <section
    aria-label={title}
    style={{
      ...base,
      ...(bare ? { padding: 0 } : null),
      ...style,
    }}
  >
    {title ? <h2 style={heading}>{title}</h2> : null}
    {children}
  </section>
)
