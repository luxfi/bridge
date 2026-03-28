import type { Metadata } from 'next'

/**
 * Default metadata stub. Actual metadata is set dynamically in layout.tsx
 * from IAM org config via fetchTenant(). This file exists only for
 * backward compatibility with imports.
 */
const metadata: Metadata = {
  title: 'Bridge',
  description: 'Cross-chain bridge',
  formatDetection: { telephone: false },
}

export default metadata
