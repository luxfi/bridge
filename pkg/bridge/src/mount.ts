// mountBridge — declarative SDK entrypoint.
//
// Mirrors the `mountExchange` pattern from @partner/exchange: the host
// passes a config and we own the DOM + React root from there.
//
//   import { mountBridge } from '@luxfi/bridge'
//
//   mountBridge({
//     config: {
//       apiHost: 'https://api.bridge.lux.network',
//       env: 'mainnet',
//       brand: { name: 'Lux Bridge', primaryColor: '#0066ff' },
//     },
//   })
//
// Idempotent — safe to call once on the host's entry script. Subsequent calls
// will create a new React root on the same element.

import { applyBrandMetadata, setConfig } from './config'
import { Bridge } from './Bridge'
import type { MountBridgeOptions } from './types'

const DEFAULT_ROOT_ID = 'bridge-root'

/**
 * Boot the bridge UI inside the host page.
 *
 * Boot order:
 *   1. Seed runtime config cache (full config — apiHost, env, brand, plus
 *      optional auth / kms / wallet / mpc blocks when present).
 *   2. Apply brand metadata to `document` (title, favicon, CSS variables).
 *   3. Resolve the DOM mount element (`#bridge-root` by default).
 *   4. Lazy-import `react-dom/client` and `react`, then render `<Bridge />`.
 *
 * The dynamic imports keep `react-dom` out of the SDK's main-bundle critical
 * path; consumers that only import types pay nothing for the runtime.
 */
export async function mountBridge(opts: MountBridgeOptions): Promise<void> {
  if (!opts || !opts.config) {
    throw new Error('mountBridge: opts.config is required')
  }

  const cfg = setConfig(opts.config)
  applyBrandMetadata(cfg.brand)

  const rootId = opts.rootId ?? DEFAULT_ROOT_ID
  const el = document.getElementById(rootId)
  if (!el) {
    throw new Error(`mountBridge: #${rootId} not found in document`)
  }

  const [{ createRoot }, react] = await Promise.all([
    import('react-dom/client'),
    import('react'),
  ])

  createRoot(el).render(react.createElement(Bridge, { config: cfg }))
}
