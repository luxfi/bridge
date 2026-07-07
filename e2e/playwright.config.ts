// Playwright config for the @luxfi/bridge tenant SPA.
//
// One config, four environments (E2E_ENV=dev|test|main, default `local`).
//
//   local: spins up `vite preview` on :3001 from app/bridge/dist
//          (so `pnpm build` in app/bridge must have run first; the preview
//          step also fails fast if it hasn't).
//   dev  : https://bridge.lux-dev.network
//   test : https://bridge.lux-test.network
//   main : https://bridge.lux.network
//
// Tenant override: BRIDGE_TENANT=zoo flips the base URL to bridge.zoo.network
// (mainnet only — Zoo doesn't operate per-env subdomains yet). Used by the
// multi-tenant spec.

import { defineConfig, devices } from '@playwright/test'

type Env = 'local' | 'dev' | 'test' | 'main'

const env: Env = ((): Env => {
  const e = process.env.E2E_ENV
  if (e === 'dev' || e === 'test' || e === 'main' || e === 'local') return e
  return 'local'
})()

const tenant = process.env.BRIDGE_TENANT ?? 'lux'

function resolveBaseUrl(): string {
  if (process.env.E2E_BASE_URL) return process.env.E2E_BASE_URL
  if (env === 'local') return 'http://localhost:3001'
  // Tenant-aware: lux uses subdomains-per-env, zoo (and others) only have
  // a single production domain so far. Adjust here when more tenants ship
  // staging environments.
  if (tenant === 'lux') {
    if (env === 'main') return 'https://bridge.lux.network'
    if (env === 'test') return 'https://bridge.lux-test.network'
    return 'https://bridge.lux-dev.network'
  }
  if (tenant === 'zoo') {
    // Zoo only operates a single bridge surface today.
    return 'https://bridge.zoo.network'
  }
  // Generic tenant fallback: bridge.<tenant>.network on mainnet.
  return `https://bridge.${tenant}.network`
}

const baseURL = resolveBaseUrl()

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: env === 'local',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Auto-boot vite preview when running locally. Skipped on remote envs —
  // there's nothing to launch. The `vite preview` command relies on a built
  // `dist/`, so the README documents `pnpm build` as the prerequisite.
  webServer:
    env === 'local'
      ? {
          command: 'pnpm --filter @luxbridge/lux-tenant preview --port 3001',
          cwd: '..',
          url: 'http://localhost:3001',
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        }
      : undefined,
})
