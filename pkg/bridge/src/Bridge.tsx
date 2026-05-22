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

import { useEffect, type FC, type ReactNode } from 'react'
// @hanzo/gui source exports `GuiProvider` (after the monorepo's postinstall
// rename) but its shipped .d.ts files still carry the upstream
// `HanzoguiProvider` name. We pull the runtime symbol directly from the
// untyped re-export module to avoid forcing every consumer of @luxfi/bridge
// to also ship the rename patch.
import * as gui from '@hanzo/gui'

import { applyBrandMetadata, setConfig } from './config'
import type { BridgeConfig } from './types'
import { BridgeApp } from './app/BridgeApp'
import { setRpcClient } from './app/lib/bridge-api'
import { BridgeRPCClient } from './app/lib/bridge-rpc'

const GuiProvider: FC<{
  children: ReactNode
  defaultTheme?: 'light' | 'dark'
}> = (gui as unknown as {
  GuiProvider: FC<{ children: ReactNode; defaultTheme?: 'light' | 'dark' }>
}).GuiProvider

export interface BridgeProps {
  /** Runtime config. Seeded into the SDK config cache on first render. */
  config: BridgeConfig
}

export const Bridge: FC<BridgeProps> = ({ config }) => {
  // Seed config synchronously before children read it. The full config —
  // including auth / kms / wallet / mpc blocks when present — is cached via
  // `setConfig`; the internal app reads them lazily through `getConfig`.
  // useEffect is for the brand metadata side effect only.
  setConfig(config)

  useEffect(() => {
    applyBrandMetadata(config.brand)
  }, [config.brand])

  // Install (or tear down) the direct-RPC client based on cfg.rpc. When
  // bchainUrl is set, the bridge-api dispatcher routes quote/submit/status
  // through BridgeVM JSON-RPC and falls back to REST on failure (default
  // policy). When bchainUrl is absent the SDK runs in pure-REST mode.
  useEffect(() => {
    const bchain = config.rpc?.bchainUrl
    if (!bchain) {
      setRpcClient(null)
      return
    }
    const init = {
      bridgeRpcUrl: bchain,
      ...(config.rpc?.tchainUrl
        ? { thresholdRpcUrl: config.rpc.tchainUrl }
        : config.mpc?.publicUrl
          ? { thresholdRpcUrl: config.mpc.publicUrl }
          : {}),
      ...(config.rpc?.timeoutMs !== undefined
        ? { timeoutMs: config.rpc.timeoutMs }
        : {}),
    }
    const client = new BridgeRPCClient(init)
    setRpcClient(client, config.rpc?.fallback ?? 'rest')
    return () => {
      setRpcClient(null)
    }
  }, [
    config.rpc?.bchainUrl,
    config.rpc?.tchainUrl,
    config.rpc?.fallback,
    config.rpc?.timeoutMs,
    config.mpc?.publicUrl,
  ])

  // `GuiProvider` is required for @hanzo/gui's `Button` / `Input` primitives
  // (used in SwapForm, WalletConnect, AssetInput) to find their theme. The
  // SDK owns this wrapper so consumers don't have to know it exists — the
  // runtime config is configured separately by `mountBridge` via
  // `createGui(getDefaultGuiConfig())`.
  return (
    <GuiProvider defaultTheme="dark">
      <BridgeApp />
    </GuiProvider>
  )
}

export default Bridge
