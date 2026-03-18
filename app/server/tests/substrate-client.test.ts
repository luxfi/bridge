/**
 * Tests for Substrate RPC client.
 *
 * These tests mock the fetch calls to avoid hitting real RPCs.
 * Run: npx tsx tests/substrate-client.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

// We need to mock fetch and logger before importing the module.
// Since substrate-client.ts uses global fetch and @/logger,
// we test the pure functions by importing and testing the module's
// exported functions with mocked fetch.

// Mock logger to avoid import alias issues
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe("Substrate client", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("getBlockNumber should parse hex block number from chain_getHeader", async () => {
    globalThis.fetch = (async (_url: any, _opts: any) => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          number: "0x1234",
          parentHash: "0x0000",
          stateRoot: "0x0000",
          extrinsicsRoot: "0x0000",
        },
      }),
    })) as any

    // Import dynamically to avoid module-level side effects
    const mod = await import("../src/domain/substrate-client.js")
    const blockNum = await mod.getBlockNumber("https://fake-rpc.test")
    assert.equal(blockNum, 0x1234)
  })

  it("getGenesisHash should return the genesis block hash", async () => {
    const expectedHash = "0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"

    globalThis.fetch = (async (_url: any, _opts: any) => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: expectedHash,
      }),
    })) as any

    const mod = await import("../src/domain/substrate-client.js")
    const hash = await mod.getGenesisHash("https://fake-rpc.test")
    assert.equal(hash, expectedHash)
  })

  it("getRuntimeVersion should return spec and transaction versions", async () => {
    globalThis.fetch = (async (_url: any, _opts: any) => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          specName: "polkadot",
          specVersion: 1002000,
          transactionVersion: 25,
        },
      }),
    })) as any

    const mod = await import("../src/domain/substrate-client.js")
    const version = await mod.getRuntimeVersion("https://fake-rpc.test")
    assert.equal(version.specVersion, 1002000)
    assert.equal(version.transactionVersion, 25)
  })

  it("getAccountNonce should return the next index", async () => {
    globalThis.fetch = (async (_url: any, _opts: any) => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: 42,
      }),
    })) as any

    const mod = await import("../src/domain/substrate-client.js")
    const nonce = await mod.getAccountNonce("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", "https://fake-rpc.test")
    assert.equal(nonce, 42)
  })

  it("submitExtrinsic should return the extrinsic hash", async () => {
    const expectedHash = "0xabcdef1234567890"

    globalThis.fetch = (async (_url: any, _opts: any) => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: expectedHash,
      }),
    })) as any

    const mod = await import("../src/domain/substrate-client.js")
    const hash = await mod.submitExtrinsic("0x1234", "https://fake-rpc.test")
    assert.equal(hash, expectedHash)
  })

  it("submitExtrinsic should throw on RPC error", async () => {
    globalThis.fetch = (async (_url: any, _opts: any) => ({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "Invalid extrinsic" },
      }),
    })) as any

    const mod = await import("../src/domain/substrate-client.js")
    await assert.rejects(
      () => mod.submitExtrinsic("0xbad", "https://fake-rpc.test"),
      /Invalid extrinsic/,
    )
  })

  it("submitExtrinsic should throw on HTTP error", async () => {
    globalThis.fetch = (async (_url: any, _opts: any) => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })) as any

    const mod = await import("../src/domain/substrate-client.js")
    await assert.rejects(
      () => mod.submitExtrinsic("0x1234", "https://fake-rpc.test"),
      /500/,
    )
  })
})
