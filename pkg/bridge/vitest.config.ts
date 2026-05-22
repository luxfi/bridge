// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // happy-dom is sufficient for the hook tests; jsdom would also work
    // but happy-dom starts ~5× faster on cold init.
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
