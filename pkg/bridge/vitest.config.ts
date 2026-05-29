// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // happy-dom is sufficient for the hook tests; jsdom would also work
    // but happy-dom starts ~5× faster on cold init.
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    server: {
      deps: {
        // The Solana wallet adapter pulls @ledgerhq/errors transitively
        // through @solana/wallet-adapter-wallets. The latter publishes
        // an ESM build that imports relative paths without `.js`
        // extensions (e.g. `from "./helpers"` instead of
        // `from "./helpers.js"`), which vitest's strict ESM resolver
        // rejects. Inlining these packages lets vite's CJS-compatible
        // resolver handle them. No-op in production (browser bundlers
        // process them normally).
        inline: [
          /@ledgerhq/,
          /@solana\/wallet-adapter/,
          /@tonconnect/,
        ],
      },
    },
  },
})
