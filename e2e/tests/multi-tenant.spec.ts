// Multi-tenant brand-routing spec.
//
// The @luxfi/bridge SDK is jurisdiction-neutral. Tenants (Lux, Zoo, future
// downstream consumers) supply their own BridgeConfig and the SDK applies
// brand metadata to the host document via `applyBrandMetadata` — which
// sets `document.title`, the favicon, and the `--brand-primary` /
// `--brand-secondary` CSS variables on `<html>`.
//
// This spec asserts the per-tenant contract holds end-to-end against the
// live production surface. It SKIPS itself when:
//   - E2E_ENV is not `main` (the only env where Zoo's bridge lives today)
//   - The tenant DNS doesn't resolve / serve a 2xx (treat as not-yet-deployed)
//
// When a third tenant ships, add another entry to TENANTS below — no other
// changes required.

import { test, expect, request as pwRequest } from '@playwright/test'

interface TenantSpec {
  name: string
  url: string
  expectedTitle: RegExp
  /** Hex color the tenant should pin --brand-primary to. */
  expectedPrimary: string
}

const TENANTS: TenantSpec[] = [
  {
    name: 'lux',
    url: 'https://bridge.lux.network',
    expectedTitle: /lux bridge/i,
    // app/bridge/src/bridge.config.ts → brand.primaryColor
    expectedPrimary: '#5b8def',
  },
  {
    name: 'zoo',
    url: 'https://bridge.zoo.network',
    expectedTitle: /zoo bridge/i,
    // Zoo's brand yellow (from the user task).
    expectedPrimary: '#fcf006',
  },
]

const env = process.env.E2E_ENV ?? 'local'

test.describe('multi-tenant brand routing', () => {
  test.skip(
    env !== 'main',
    'Multi-tenant assertions only run against E2E_ENV=main (the surface where every tenant has a public deployment).'
  )

  for (const tenant of TENANTS) {
    test(`[${tenant.name}] ${tenant.url} pins brand primary to ${tenant.expectedPrimary}`, async ({
      browser,
    }) => {
      // Probe DNS / availability before mounting a full page context — saves
      // 15s of nav timeout on tenants that haven't shipped yet.
      const probe = await pwRequest.newContext({ ignoreHTTPSErrors: false })
      const head = await probe.get(tenant.url, { failOnStatusCode: false }).catch(() => null)
      await probe.dispose()
      test.skip(
        !head || head.status() >= 400,
        `${tenant.url} not reachable (HEAD failed or non-2xx) — tenant not deployed yet.`
      )

      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const response = await page.goto(tenant.url)
      expect(response?.status(), `${tenant.url} responds 2xx`).toBeLessThan(400)

      await expect(page).toHaveTitle(tenant.expectedTitle)

      // The SDK writes brand.primaryColor onto `--brand-primary` via
      // applyBrandMetadata (see pkg/bridge/src/config.ts). Read it back
      // from computed style on <html>.
      const primary = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim()
      )
      expect(
        primary.toLowerCase(),
        `${tenant.name} --brand-primary on <html>`
      ).toBe(tenant.expectedPrimary.toLowerCase())

      await ctx.close()
    })
  }

  // TODO: hostname-based brand routing on a SHARED build (i.e. one Docker
  // image serves multiple tenants based on the Host header). Today each
  // tenant ships its own image (app/bridge for Lux, equivalent dir for Zoo
  // when it lands), so the brand block is build-time, not request-time.
  // When the shared-image route lands, add a spec that hits the same image
  // with `Host: bridge.zoo.network` and verifies Zoo branding.
})
