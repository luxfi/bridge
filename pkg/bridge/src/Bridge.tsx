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
//
// History: prior to Phase 1.5 this file lazy-imported `@luxbridge/app`. That
// created a workspace cycle (tenant repos that re-exported the SDK could
// only stub `@luxbridge/app` to break the cycle, which produced a blank
// page). The bridge UI is now inlined under `./app/`, so there is no
// runtime dependency on any sibling workspace package.

import { useEffect, type FC } from 'react'

import { applyBrandMetadata, setConfig } from './config'
import type { BridgeConfig } from './types'
import { BridgeApp } from './app/BridgeApp'

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

  return <BridgeApp />
}

export default Bridge
