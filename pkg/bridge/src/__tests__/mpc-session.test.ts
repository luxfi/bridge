// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMpcSignSession } from '../app/lib/mpc-session'
import type { BridgeMPCConfig } from '../types'

const MPC_URL = 'https://mpc.example.test'

const mpc: BridgeMPCConfig = { publicUrl: MPC_URL }

// Each test replaces global.fetch with a queue of canned JSON-RPC responses.
function jsonRpcQueue(
  responses: Array<{ result?: unknown; error?: { code: number; message: string } }>,
) {
  let i = 0
  return vi.fn().mockImplementation(() => {
    const next = responses[i++] ?? responses[responses.length - 1]
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          jsonrpc: '2.0',
          id: 1,
          ...next,
        }),
    })
  })
}

const originalFetch = global.fetch

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('runMpcSignSession', () => {
  it('drives a session from pending → completed and surfaces the signature', async () => {
    global.fetch = jsonRpcQueue([
      // threshold_sign
      {
        result: {
          sessionId: 'session-1',
          keyId: 'key-1',
          status: 'pending',
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      },
      // threshold_getSignature poll 1
      {
        result: {
          sessionId: 'session-1',
          status: 'signing',
        },
      },
      // threshold_getSignature poll 2 (completed)
      {
        result: {
          sessionId: 'session-1',
          status: 'completed',
          signature: '0xdeadbeef',
        },
      },
    ])

    const progress: Array<{ status: string; signature?: string }> = []
    const final = await runMpcSignSession({
      mpc,
      keyId: 'key-1',
      messageHash: '0xabc',
      timeoutMs: 5_000,
      onProgress: (p) => progress.push({ status: p.status, ...(p.signature ? { signature: p.signature } : {}) }),
    })

    expect(final.status).toBe('completed')
    expect(final.signature).toBe('0xdeadbeef')
    expect(final.protocol).toBe('cggmp21')
    expect(progress.map((p) => p.status)).toEqual(['pending', 'signing', 'completed'])
  })

  it('returns failed status without throwing when the session fails', async () => {
    global.fetch = jsonRpcQueue([
      {
        result: {
          sessionId: 'session-2',
          keyId: 'key-1',
          status: 'pending',
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      },
      {
        result: {
          sessionId: 'session-2',
          status: 'failed',
          error: 'threshold not reached',
        },
      },
    ])

    const final = await runMpcSignSession({
      mpc,
      keyId: 'key-1',
      messageHash: '0xabc',
      timeoutMs: 5_000,
    })

    expect(final.status).toBe('failed')
    expect(final.error).toMatch(/threshold/)
  })

  it('respects the protocol field on the config', async () => {
    global.fetch = jsonRpcQueue([
      {
        result: {
          sessionId: 's',
          keyId: 'k',
          status: 'completed',
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      },
      {
        result: {
          sessionId: 's',
          status: 'completed',
          signature: '0x01',
        },
      },
    ])

    const final = await runMpcSignSession({
      mpc: { publicUrl: MPC_URL, protocol: 'pulsar' },
      keyId: 'k',
      messageHash: '0x',
      timeoutMs: 1_000,
    })

    expect(final.protocol).toBe('pulsar')
  })

  it('aborts polling on signal abort', async () => {
    // Sign response, then "signing" forever.
    let signCount = 0
    global.fetch = vi.fn().mockImplementation(() => {
      signCount += 1
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result:
              signCount === 1
                ? {
                    sessionId: 'session-3',
                    keyId: 'k',
                    status: 'pending',
                    createdAt: Date.now(),
                    expiresAt: Date.now() + 60_000,
                  }
                : {
                    sessionId: 'session-3',
                    status: 'signing',
                  },
          }),
      })
    })

    const ctl = new AbortController()
    const p = runMpcSignSession({
      mpc,
      keyId: 'k',
      messageHash: '0x',
      timeoutMs: 30_000,
      signal: ctl.signal,
    })
    // Let the poll loop fire at least once.
    await new Promise((r) => setTimeout(r, 350))
    ctl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})
