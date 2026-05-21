// <Bridge /> — React component entry for the @luxfi/bridge SDK.
//
// Downstream consumers that want fine-grained control over their React tree
// import this component directly:
//
//   import { Bridge } from '@luxfi/bridge/Bridge'
//   import { config } from './bridge.config'
//
//   function App() {
//     return <Bridge config={config} />
//   }
//
// For declarative mounting (mounts into a DOM node, manages root, applies
// brand metadata), prefer `mountBridge` from '@luxfi/bridge'.

import { lazy, Suspense, useEffect, type FC } from 'react'

import { applyBrandMetadata, setConfig } from './config'
import type { BridgeConfig } from './types'

// Lazy-load the internal app so the SDK's bundle stays small for callers that
// import types only. The actual bridge UI lives in @luxbridge/app and is
// resolved via the workspace dep at install time.
const InternalApp = lazy(async () => {
  const mod = (await import('@luxbridge/app')) as { App?: FC; default?: FC }
  const Component = mod.App ?? mod.default
  if (!Component) {
    throw new Error('@luxfi/bridge: @luxbridge/app did not export App or default')
  }
  return { default: Component }
})

export interface BridgeProps {
  /** Runtime config. Seeded into the SDK config cache on first render. */
  config: BridgeConfig
}

export const Bridge: FC<BridgeProps> = ({ config }) => {
  // Seed config synchronously before children read it. useEffect is for the
  // brand metadata side effect only.
  setConfig(config)

  useEffect(() => {
    applyBrandMetadata(config.brand)
  }, [config.brand])

  return (
    <Suspense fallback={null}>
      <InternalApp />
    </Suspense>
  )
}

export default Bridge
