// bridge.lux.network — slim tenant entry.
//
// Everything bridge-related lives in @luxfi/bridge (UI, hooks, types).
// Everything brand-related lives in @luxfi/brand. This file does nothing
// but pin a config and call the SDK's mountBridge().
//
// To change behavior:
//   - brand:  ~/work/lux/brand          → bump @luxfi/brand
//   - bridge: ~/work/lux/bridge/pkg/bridge → bump @luxfi/bridge

import { mountBridge } from '@luxfi/bridge'

import { bridgeConfig } from './bridge.config'

void mountBridge({
  config: bridgeConfig,
  rootId: 'bridge-root',
})
