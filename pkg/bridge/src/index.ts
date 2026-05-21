// @luxfi/bridge — public SDK entrypoint.
//
// Downstream consumers (Lux, Hanzo, Zoo, Liquidity, etc.) import from here:
//
//   import { mountBridge } from '@luxfi/bridge'
//   import { Bridge, type BridgeConfig } from '@luxfi/bridge'
//
// Internal packages (`@luxbridge/app`, `@luxbridge/settings`, …) are
// implementation details and are never imported directly by consumers.

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
  BridgeAuthConfig,
  BridgeConfig,
  BridgeKMSConfig,
  BridgeMPCConfig,
  BridgeWalletConfig,
  MountBridgeOptions,
} from './types'
