import { describe, expect, it } from 'vitest'

import { createBridgeRPCClient } from '../app/lib/bridge-rpc'

// These two defaults are the whole public contract of the factory: a caller
// that passes only `nodeUrl` is trusting the SDK to know where the B-Chain and
// T-Chain live. luxd serves exactly one prefix, /v1 (node/server/http/server.go),
// and it has never served /ext — so the previous defaults pointed every such
// caller at a 404 with no way to tell from the outside.
describe('createBridgeRPCClient default endpoints', () => {
  const nodeUrl = 'https://node.lux.network'

  it('derives both chain URLs from nodeUrl under /v1', () => {
    const c = createBridgeRPCClient({ nodeUrl }) as unknown as {
      bridgeRpcUrl: string
      thresholdRpcUrl: string
    }
    expect(c.bridgeRpcUrl).toBe(`${nodeUrl}/v1/bc/B/rpc`)
    expect(c.thresholdRpcUrl).toBe(`${nodeUrl}/v1/bc/T/rpc`)
  })

  it('leaves no /ext anywhere in the defaults', () => {
    const c = createBridgeRPCClient({ nodeUrl }) as unknown as Record<string, unknown>
    for (const v of Object.values(c)) {
      if (typeof v === 'string') expect(v).not.toContain('/ext/')
    }
  })

  // Explicit URLs must still win, otherwise an operator cannot point the SDK at
  // a gateway whose paths differ.
  it('honours explicit overrides', () => {
    const c = createBridgeRPCClient({
      nodeUrl,
      bridgeRpcUrl: 'https://gw.example/custom/B',
      thresholdRpcUrl: 'https://gw.example/custom/T',
    }) as unknown as { bridgeRpcUrl: string; thresholdRpcUrl: string }
    expect(c.bridgeRpcUrl).toBe('https://gw.example/custom/B')
    expect(c.thresholdRpcUrl).toBe('https://gw.example/custom/T')
  })
})
