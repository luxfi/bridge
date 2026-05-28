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
// @hanzo/gui ships two compatible naming surfaces across 7.x dists:
// 7.0.0 (empty dist, patched in by postinstall) exposes `GuiProvider`;
// 7.2.x (populated dist) exposes the upstream `HanzoguiProvider`. SDK
// accepts whichever is present so a tenant on either pin works.
import * as gui from '@hanzo/gui'

import { applyBrandMetadata, setConfig } from './config'
import type { BridgeConfig } from './types'
import { BridgeApp } from './app/BridgeApp'
import { setRpcClient } from './app/lib/bridge-api'
import { BridgeRPCClient } from './app/lib/bridge-rpc'

const guiAny = gui as unknown as Record<string, unknown>
const GuiProvider = (guiAny.GuiProvider ?? guiAny.HanzoguiProvider) as
  | FC<{ children: ReactNode; defaultTheme?: 'light' | 'dark' }>
  | undefined

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
  if (!GuiProvider) {
    throw new Error(
      '@hanzo/gui exports neither GuiProvider nor HanzoguiProvider — install >=7.0.0',
    )
  }
  return (
    <GuiProvider defaultTheme="dark">
      <BridgeApp />
    </GuiProvider>
  )
}

export default Bridge
