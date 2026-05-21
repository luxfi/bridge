// @luxfi/bridge — public SDK entrypoint.
//
// Downstream consumers (Lux, Hanzo, Zoo, etc.) import from here:
//
//   import { mountBridge } from '@luxfi/bridge'
//   import { Bridge, type BridgeConfig } from '@luxfi/bridge'
//
// The bridge UI is inlined under `./app/` — there are no workspace
// dependencies on sibling tenant packages (Phase 1.5 severed the
// `@luxbridge/app` cycle that produced the blank-page bug).

export { Bridge } from './Bridge'
export type { BridgeProps } from './Bridge'

export { mountBridge } from './mount'

export {
  applyBrandMetadata,
  getConfig,
  setConfig,
} from './config'

export type {
  BrandConfig,
  BridgeConfig,
  MountBridgeOptions,
} from './types'
