// Smoke spec for the tenant bridge SPA.
//
// Runs against `baseURL` from playwright.config.ts. Verifies:
//
//   1. Page renders (200 + #bridge-root present + React hydrated)
//   2. Title matches the configured brand (default: "Lux Bridge")
//   3. Brand logo SVG is in the DOM (img with data:image/svg+xml src,
//      as wired by @luxfi/logo's getColorSVG → data URL)
//   4. From-chain selector has ≥ 2 options
//   5. From-asset selector has ≥ 2 options
//   6. "Connect Wallet" button visible + clickable (no real connect)
//   7. Typing an amount updates the "You receive" estimate
//   8. Production gate: bundled JS does NOT contain `DEADBEEF`
//      (the dev-only stub MPC display address — see useWallet.ts)
//
// Deliberately does NOT cover:
//   - Real wallet connect (needs Playwright wallet mocking — TODO)
//   - Backend swap submit (prod backend not always reachable from CI — TODO)
//   - Visual regression (separate PR)

import { test, expect, type Page } from '@playwright/test'

const TENANT = process.env.BRIDGE_TENANT ?? 'lux'
const EXPECTED_TITLE = TENANT === 'zoo' ? /zoo bridge/i : /lux bridge/i

/**
 * Common page-load helper: navigate, collect any console / page errors,
 * and assert the React tree mounted by waiting for the <header> element
 * the SDK renders. Surfaces a precise error message when the SPA fails to
 * mount (the most common failure mode is a missing runtime config such as
 * the @hanzo/gui createGui() call producing the cryptic "Err0" throw).
 */
async function loadBridge(page: Page): Promise<{ errors: string[] }> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  const response = await page.goto('/')
  expect(response?.status(), 'index.html responds 200').toBe(200)

  // Wait up to 5s for the SDK to mount its <header>. If it never appears,
  // surface the captured console errors instead of a generic timeout — the
  // typical cause is a thrown error during render (Tamagui / @hanzo/gui
  // configuration missing).
  try {
    await expect(page.locator('header')).toBeVisible({ timeout: 5_000 })
  } catch (e) {
    const summary =
      errors.length > 0
        ? `\n\nSPA failed to mount. Captured errors:\n  - ${errors.join('\n  - ')}`
        : '\n\nSPA failed to mount and no console errors were captured.'
    throw new Error(`bridge SDK did not render <header>${summary}`)
  }

  return { errors }
}

test.describe(`[${TENANT}] bridge smoke`, () => {
  test('renders, title matches brand, brand logo present', async ({ page }) => {
    await loadBridge(page)

    // Title is set by `applyBrandMetadata(brand)` at mount; for Lux the
    // tenant config pins it to "Lux Bridge" (see app/bridge/index.html +
    // src/bridge.config.ts).
    await expect(page).toHaveTitle(EXPECTED_TITLE)

    // The root element exists and is populated by mountBridge.
    await expect(page.locator('#bridge-root')).toBeVisible()

    // Brand logo: tenant config inlines an SVG data URL via @luxfi/logo's
    // getColorSVG. Header.tsx renders it as `<img src={logoUrl} alt={name}>`.
    const logo = page.locator('header img[alt$="Bridge" i]').first()
    await expect(logo).toBeVisible()
    const logoSrc = await logo.getAttribute('src')
    expect(logoSrc, 'logo src is set').not.toBeNull()
    expect(
      logoSrc!.startsWith('data:image/svg+xml') || logoSrc!.endsWith('.svg'),
      'logo is an SVG (data URL or .svg file)'
    ).toBe(true)
  })

  test('from-chain selector has multiple options', async ({ page }) => {
    await loadBridge(page)
    // ChainSelector.tsx labels the select as `From chain` (aria-label).
    const fromChain = page.locator('select[aria-label="From chain"]')
    await expect(fromChain).toBeVisible()
    const optionCount = await fromChain.locator('option').count()
    expect(optionCount, 'from-chain has ≥ 2 options').toBeGreaterThanOrEqual(2)
  })

  test('from-asset selector has multiple options once a multi-asset chain is selected', async ({
    page,
  }) => {
    await loadBridge(page)

    // The from-asset list is scoped to the currently-selected from-chain
    // (see `assetsForChain` in pkg/bridge/src/app/lib/assets.ts). The default
    // chain (Lux Network) only ships a single native asset, so we first
    // switch to Ethereum, which has multiple assets in the static registry.
    const fromChain = page.locator('select[aria-label="From chain"]')
    await fromChain.selectOption({ label: 'Ethereum' })

    const fromAsset = page.locator('select[aria-label="You send asset"]')
    await expect(fromAsset).toBeVisible()
    // Wait for the asset list to repopulate post chain switch.
    await expect
      .poll(async () => fromAsset.locator('option').count(), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)
  })

  test('connect wallet button is visible and clickable', async ({ page }) => {
    await loadBridge(page)
    // WalletConnect.tsx renders a button with the text "Connect Wallet" when
    // wallet.address is null. The stub useWallet starts unconnected.
    //
    // Anchor inside <header> to disambiguate from the SwapForm submit
    // button (text "Connect wallet to bridge") that fuzzy-matches the
    // same name regex.
    const connectBtn = page
      .locator('header')
      .getByRole('button', { name: /^connect wallet$/i })
    await expect(connectBtn).toBeVisible()
    await expect(connectBtn).toBeEnabled()
    // Click is safe — the stub connect() either resolves to a dev address or
    // throws ("Real MPC wallet wiring lands in Phase 3 R3."). We don't assert
    // on the result; just that the button accepts a click without crashing
    // the React tree. Real MPC mocking is a future spec.
    await connectBtn.click().catch(() => {
      // tolerate stub throw — see useWallet.ts
    })
    // Body is still rendered (React did not unmount).
    await expect(page.locator('#bridge-root')).toBeVisible()
  })

  test('typing an amount updates the "You receive" estimate', async ({ page }) => {
    await loadBridge(page)
    const sendInput = page.locator('input[aria-label="You send amount"]')
    const receiveInput = page.locator('input[aria-label="You receive amount"]')

    await expect(sendInput).toBeVisible()
    await expect(receiveInput).toBeVisible()

    // Initial state: receive is empty (no quote yet).
    const initialReceive = await receiveInput.inputValue()
    expect(initialReceive, 'receive is empty before any input').toBe('')

    // useSwap.ts derives a quote synchronously from amount. After typing,
    // the quote populates and "You receive" reads via formatAmount(rate, 6).
    await sendInput.fill('1')

    // Wait for the receive box to update — useSwap is synchronous so this
    // should happen on the next render tick; we allow generous slop.
    await expect(receiveInput).not.toHaveValue('', { timeout: 5_000 })

    const receivedValue = await receiveInput.inputValue()
    expect(receivedValue.trim().length, 'receive has a value').toBeGreaterThan(0)
    // It should also be numeric-ish (digits + optional decimal point + commas).
    expect(receivedValue, 'receive looks like a number').toMatch(/^[\d.,]+$/)
  })

  test('production gate: page source does NOT contain DEADBEEF', async ({
    page,
    request,
  }) => {
    // The stub MPC wallet address (useWallet.ts) is `0xLUXBRIDGE...DEADBEEF`,
    // guarded by `import.meta.env.DEV`. In production / preview / any
    // tenant-deployed build, this literal must tree-shake to unreachable
    // code and never appear in the served bundle.
    //
    // We check: (a) the page HTML doesn't contain it, and (b) the first JS
    // bundle linked from index.html doesn't either. Source maps (.js.map)
    // are explicitly excluded — those may legitimately retain identifiers
    // when sourcemap: true is set in vite.config.ts.

    await page.goto('/')
    const html = await page.content()
    expect(html, 'page HTML free of DEADBEEF').not.toContain('DEADBEEF')

    // Pull every <script src> from the served HTML and probe them.
    const scriptSrcs = await page.$$eval(
      'script[src]',
      (els) => (els as HTMLScriptElement[]).map((s) => s.src)
    )
    expect(scriptSrcs.length, 'page has at least one JS bundle').toBeGreaterThan(0)

    for (const src of scriptSrcs) {
      if (src.endsWith('.map')) continue
      const r = await request.get(src)
      expect(r.status(), `${src} responds 200`).toBe(200)
      const body = await r.text()
      expect(body, `${src} free of DEADBEEF`).not.toContain('DEADBEEF')
    }
  })
})
