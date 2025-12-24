// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ThresholdClient } from './client'
import type { KeygenResponse, SignatureResponse } from './types'

describe('ThresholdClient', () => {
  let client: ThresholdClient

  beforeEach(() => {
    client = new ThresholdClient({
      endpoint: 'http://localhost:9650/ext/bc/T',
      chainId: 'test-chain',
    })
  })

  describe('constructor', () => {
    it('should create client with options', () => {
      expect(client).toBeInstanceOf(ThresholdClient)
    })
  })

  describe('keygen', () => {
    it('should call keygen with chain', async () => {
      const mockResponse: KeygenResponse = {
        sessionId: 'sess-123',
        keyId: 'key-1',
        protocol: 'lss',
        status: 'pending',
        threshold: 2,
        totalParties: 3,
        startedAt: Date.now(),
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: mockResponse }),
      })

      const result = await client.keygen({ keyId: 'key-1', chain: 'ethereum' })
      expect(result.keyId).toBe('key-1')
      expect(result.protocol).toBe('lss')
    })

    it('should call keygen with protocol', async () => {
      const mockResponse: KeygenResponse = {
        sessionId: 'sess-456',
        keyId: 'frost-key',
        protocol: 'frost',
        status: 'pending',
        threshold: 2,
        totalParties: 3,
        startedAt: Date.now(),
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: mockResponse }),
      })

      const result = await client.keygen({ keyId: 'frost-key', protocol: 'frost' })
      expect(result.protocol).toBe('frost')
    })
  })

  describe('keygenForChain', () => {
    it('should be a convenience wrapper', async () => {
      const mockResponse: KeygenResponse = {
        sessionId: 'sess-789',
        keyId: 'sol-key',
        protocol: 'frost',
        status: 'pending',
        threshold: 2,
        totalParties: 3,
        startedAt: Date.now(),
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: mockResponse }),
      })

      const result = await client.keygenForChain('sol-key', 'solana')
      expect(result.keyId).toBe('sol-key')
      expect(result.protocol).toBe('frost')
    })
  })

  describe('sign', () => {
    it('should request signature', async () => {
      const mockResponse = {
        sessionId: 'sign-123',
        keyId: 'key-1',
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: mockResponse }),
      })

      const result = await client.sign({
        keyId: 'key-1',
        messageHash: '0x1234567890abcdef',
      })

      expect(result.sessionId).toBe('sign-123')
      expect(result.status).toBe('pending')
    })
  })

  describe('signAndWait', () => {
    it('should sign and poll for completion', async () => {
      const signResponse = {
        sessionId: 'sign-456',
        keyId: 'key-1',
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      }

      const sigResponse: SignatureResponse = {
        sessionId: 'sign-456',
        status: 'completed',
        signature: '0xabcdef',
        r: '0x123',
        s: '0x456',
        v: 27,
        completedAt: Date.now(),
      }

      let callCount = 0
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: signResponse }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ jsonrpc: '2.0', id: 2, result: sigResponse }),
        })
      })

      const result = await client.signAndWait({
        keyId: 'key-1',
        messageHash: '0xabcdef',
      })

      expect(result.status).toBe('completed')
      expect(result.signature).toBe('0xabcdef')
    })
  })

  describe('error handling', () => {
    it('should throw on RPC error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32600, message: 'Invalid request' },
          }),
      })

      await expect(client.keygen({ keyId: 'key-1' })).rejects.toThrow('RPC error')
    })

    it('should throw on HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(client.keygen({ keyId: 'key-1' })).rejects.toThrow('HTTP 500')
    })
  })
})
