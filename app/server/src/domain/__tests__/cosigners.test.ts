// Wire-shape validation tests for layered cosigner intents.
//
// The validator is the trust boundary between the public HTTP surface
// and the internal cosign dispatch — every test here represents either a
// shape the SDK is legitimately allowed to send (must pass) or a shape
// that smells like an exploit / mistake (must reject loudly).

import { describe, expect, it } from "vitest"

import {
  BadCosignerIntent,
  type CosignerIntent,
  validateCosigners,
} from "../cosigners"

describe("validateCosigners — happy paths (must pass)", () => {
  it("returns [] for undefined / null", () => {
    expect(validateCosigners(undefined)).toEqual([])
    expect(validateCosigners(null)).toEqual([])
  })

  it("returns [] for empty array", () => {
    expect(validateCosigners([])).toEqual([])
  })

  it("accepts a minimal utila intent", () => {
    const out = validateCosigners([
      { kind: "utila", org_id: "tenant-x", client_id: "lux-bridge" },
    ])
    expect(out).toEqual<CosignerIntent[]>([
      { kind: "utila", org_id: "tenant-x", client_id: "lux-bridge" },
    ])
  })

  it("accepts a full utila intent (api_host + vault_id)", () => {
    const out = validateCosigners([
      {
        kind: "utila",
        org_id: "tenant-x",
        client_id: "lux-bridge",
        api_host: "https://api.utila.io",
        vault_id: "vault_123",
      },
    ])
    expect(out[0]).toMatchObject({
      kind: "utila",
      api_host: "https://api.utila.io",
      vault_id: "vault_123",
    })
  })

  it("accepts a minimal fireblocks intent", () => {
    const out = validateCosigners([
      { kind: "fireblocks", api_key: "pub-key-id" },
    ])
    expect(out).toEqual<CosignerIntent[]>([
      { kind: "fireblocks", api_key: "pub-key-id" },
    ])
  })

  it("accepts both kinds together", () => {
    const out = validateCosigners([
      { kind: "utila", org_id: "x", client_id: "y" },
      { kind: "fireblocks", api_key: "z" },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]!.kind).toBe("utila")
    expect(out[1]!.kind).toBe("fireblocks")
  })
})

describe("validateCosigners — rejections (must throw BadCosignerIntent)", () => {
  it("rejects a non-array", () => {
    expect(() => validateCosigners("not an array")).toThrow(BadCosignerIntent)
    expect(() => validateCosigners({})).toThrow(BadCosignerIntent)
  })

  it("rejects unknown kind", () => {
    expect(() =>
      validateCosigners([{ kind: "ledger", api_key: "abc" }]),
    ).toThrowError(/unknown cosigner kind/)
  })

  it("rejects utila missing org_id", () => {
    expect(() =>
      validateCosigners([{ kind: "utila", client_id: "lux-bridge" }]),
    ).toThrowError(/utila: org_id required/)
  })

  it("rejects utila missing client_id", () => {
    expect(() =>
      validateCosigners([{ kind: "utila", org_id: "tenant-x" }]),
    ).toThrowError(/utila: client_id required/)
  })

  it("rejects fireblocks missing api_key", () => {
    expect(() =>
      validateCosigners([{ kind: "fireblocks", vault_account_id: "0" }]),
    ).toThrowError(/fireblocks: api_key required/)
  })

  // — defensive: secret-like fields must NEVER cross the wire —

  it("rejects a 'secret' field on any entry", () => {
    expect(() =>
      validateCosigners([
        { kind: "fireblocks", api_key: "k", secret: "leaked" },
      ]),
    ).toThrowError(/secret-like field/)
  })

  it("rejects 'private_key' (case-insensitive)", () => {
    expect(() =>
      validateCosigners([
        {
          kind: "fireblocks",
          api_key: "k",
          PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
        },
      ]),
    ).toThrowError(/secret-like field/)
  })

  it("rejects 'service_account_private_key'", () => {
    expect(() =>
      validateCosigners([
        {
          kind: "utila",
          org_id: "x",
          client_id: "y",
          service_account_private_key: "...",
        },
      ]),
    ).toThrowError(/secret-like field/)
  })

  it("rejects 'jwt' and 'token' (common leak vectors)", () => {
    expect(() =>
      validateCosigners([
        { kind: "utila", org_id: "x", client_id: "y", jwt: "ey..." },
      ]),
    ).toThrowError(/secret-like field/)
    expect(() =>
      validateCosigners([
        { kind: "fireblocks", api_key: "k", token: "..." },
      ]),
    ).toThrowError(/secret-like field/)
  })

  it("reports the offending array index in the error message", () => {
    try {
      validateCosigners([
        { kind: "utila", org_id: "x", client_id: "y" },
        { kind: "fireblocks" /* no api_key */ },
      ])
      throw new Error("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(BadCosignerIntent)
      expect((err as BadCosignerIntent).index).toBe(1)
      expect((err as Error).message).toContain("cosigners[1]")
    }
  })
})
