// mountBridge — declarative SDK entrypoint.
//
// Mirrors the `mountExchange` pattern from @liquidityio/exchange: the host
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
 * Boot the @hanzo/gui runtime once globally. The library's `Button` and
 * `Input` primitives (used by Phase 3 R2's SwapForm / WalletConnect /
 * AssetInput) read from `globalThis.__guiConfig` at render time and throw
 * `Error("Err0")` when it's null. The SDK owns this initialisation so
 * every consumer doesn't have to know that detail.
 *
 * Idempotent — `createGui` is safe to call multiple times (later calls
 * overwrite the global config, which is fine because the default config
 * is deterministic).
 */
async function ensureGuiConfigured(): Promise<void> {
  if (
    typeof globalThis !== 'undefined' &&
    (globalThis as { __guiConfig?: unknown }).__guiConfig
  ) {
    return
  }
  // @hanzo/gui ships two compatible naming surfaces across its 7.x
  // dist artefacts:
  //   - 7.0.0 shipped an empty dist/; the consumer-side postinstall
  //     (scripts/patch-hanzogui-exports.cjs) rewrites package.json to
  //     point at src/, where the upstream `createHanzogui` /
  //     `HanzoguiProvider` / `getDefaultHanzoguiConfig` were renamed
  //     to `createGui` / `GuiProvider` / `getDefaultGuiConfig`.
  //   - 7.2.x ships a populated dist/ — the patch script no longer
  //     rewrites it, so the dist/ exports use the upstream Hanzogui
  //     symbol names verbatim.
  //
  // The SDK accepts whichever pair is present so a tenant can sit on
  // either 7.0.0 (with the patch) or 7.2.x (without) and mount cleanly.
  // Helper widens types so tsc doesn't require both names to be present
  // on the static declaration surface.
  const [gui, cfgDefault] = await Promise.all([
    import('@hanzo/gui'),
    import('@hanzogui/config-default'),
  ])
  const guiAny = gui as unknown as Record<string, unknown>
  const cfgAny = cfgDefault as unknown as Record<string, unknown>
  const createGui =
    (guiAny.createGui as ((c: unknown) => unknown) | undefined) ??
    (guiAny.createHanzogui as ((c: unknown) => unknown) | undefined)
  if (!createGui) {
    throw new Error(
      'mountBridge: neither @hanzo/gui.createGui nor createHanzogui is exported — ' +
        'install @hanzo/gui >=7.0.0 or run the patch-hanzogui-exports.cjs postinstall',
    )
  }
  const getDefaultConfig =
    (cfgAny.getDefaultGuiConfig as (() => unknown) | undefined) ??
    (cfgAny.getDefaultHanzoguiConfig as (() => unknown) | undefined)
  if (!getDefaultConfig) {
    throw new Error(
      'mountBridge: neither @hanzogui/config-default.getDefaultGuiConfig nor getDefaultHanzoguiConfig is exported',
    )
  }
  createGui(getDefaultConfig())
}

/**
 * Boot the bridge UI inside the host page.
 *
 * Boot order:
 *   1. Seed runtime config cache (full config — apiHost, env, brand, plus
 *      optional auth / kms / wallet / mpc blocks when present).
 *   2. Apply brand metadata to `document` (title, favicon, CSS variables).
 *   3. Resolve the DOM mount element (`#bridge-root` by default).
 *   4. Configure @hanzo/gui's global runtime so Button/Input render.
 *   5. Lazy-import `react-dom/client` and `react`, then render `<Bridge />`.
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

  await ensureGuiConfigured()

  const [{ createRoot }, react] = await Promise.all([
    import('react-dom/client'),
    import('react'),
  ])

  createRoot(el).render(react.createElement(Bridge, { config: cfg }))
}
