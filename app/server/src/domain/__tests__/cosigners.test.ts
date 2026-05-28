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

  it("accepts cloud_hsm/gcp_kms with key_ref + algorithm + identity_hint", () => {
    const out = validateCosigners([
      {
        kind: "cloud_hsm",
        provider: "gcp_kms",
        key_ref:
          "projects/p/locations/global/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1",
        algorithm: "secp256k1_ecdsa_sha256",
        identity_hint: "sa@tenant.iam.gserviceaccount.com",
      },
    ])
    expect(out[0]).toMatchObject({
      kind: "cloud_hsm",
      provider: "gcp_kms",
      algorithm: "secp256k1_ecdsa_sha256",
      identity_hint: "sa@tenant.iam.gserviceaccount.com",
    })
  })

  it("accepts cloud_hsm/aws_kms with full ARN as key_ref", () => {
    const out = validateCosigners([
      {
        kind: "cloud_hsm",
        provider: "aws_kms",
        key_ref:
          "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000",
        algorithm: "secp256k1_ecdsa_sha256",
      },
    ])
    expect(out[0]).toMatchObject({
      kind: "cloud_hsm",
      provider: "aws_kms",
    })
  })

  it("accepts cloud_hsm/azure_key_vault with key URL as key_ref", () => {
    const out = validateCosigners([
      {
        kind: "cloud_hsm",
        provider: "azure_key_vault",
        key_ref:
          "https://my-vault.vault.azure.net/keys/my-key/abcdef1234567890",
        algorithm: "secp256k1_ecdsa_sha256",
      },
    ])
    expect(out[0]).toMatchObject({
      kind: "cloud_hsm",
      provider: "azure_key_vault",
    })
  })

  it("accepts cloud_hsm/vault_transit", () => {
    const out = validateCosigners([
      {
        kind: "cloud_hsm",
        provider: "vault_transit",
        key_ref: "transit/keys/my-bridge-key",
        algorithm: "ed25519",
      },
    ])
    expect(out[0]).toMatchObject({
      kind: "cloud_hsm",
      provider: "vault_transit",
      algorithm: "ed25519",
    })
  })

  it("accepts fchain with scheme", () => {
    const out = validateCosigners([
      {
        kind: "fchain",
        public_url: "https://fchain.lux.network",
        scheme: "ckks",
      },
    ])
    expect(out[0]).toMatchObject({
      kind: "fchain",
      public_url: "https://fchain.lux.network",
      scheme: "ckks",
    })
  })

  it("accepts every cosigner kind layered together", () => {
    const out = validateCosigners([
      { kind: "utila", org_id: "u", client_id: "c" },
      { kind: "fireblocks", api_key: "f" },
      {
        kind: "cloud_hsm",
        provider: "gcp_kms",
        key_ref: "k1",
        algorithm: "secp256k1_ecdsa_sha256",
      },
      {
        kind: "cloud_hsm",
        provider: "aws_kms",
        key_ref: "arn:...",
        algorithm: "secp256k1_ecdsa_sha256",
      },
      {
        kind: "cloud_hsm",
        provider: "azure_key_vault",
        key_ref: "https://v.vault.azure.net/keys/k",
        algorithm: "secp256k1_ecdsa_sha256",
      },
      {
        kind: "cloud_hsm",
        provider: "vault_transit",
        key_ref: "transit/keys/k",
        algorithm: "ed25519",
      },
      { kind: "fchain", public_url: "https://fchain.lux.network" },
    ])
    expect(out).toHaveLength(7)
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

  // — cloud_hsm validation —

  it("rejects cloud_hsm with unknown provider", () => {
    expect(() =>
      validateCosigners([
        {
          kind: "cloud_hsm",
          provider: "ibm_zhsm",
          key_ref: "k",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ]),
    ).toThrowError(/cloud_hsm: unknown provider/)
  })

  it("rejects cloud_hsm missing key_ref", () => {
    expect(() =>
      validateCosigners([
        {
          kind: "cloud_hsm",
          provider: "gcp_kms",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ]),
    ).toThrowError(/key_ref required/)
  })

  it("rejects cloud_hsm missing algorithm (required to reject early)", () => {
    expect(() =>
      validateCosigners([
        { kind: "cloud_hsm", provider: "gcp_kms", key_ref: "k" },
      ]),
    ).toThrowError(/algorithm required/)
  })

  it("rejects cloud_hsm with unsupported algorithm", () => {
    expect(() =>
      validateCosigners([
        {
          kind: "cloud_hsm",
          provider: "gcp_kms",
          key_ref: "k",
          algorithm: "md5_ecdsa", // not in the allow-list
        },
      ]),
    ).toThrowError(/algorithm required/)
  })

  it("rejects secret-like fields on cloud_hsm too", () => {
    expect(() =>
      validateCosigners([
        {
          kind: "cloud_hsm",
          provider: "gcp_kms",
          key_ref: "k",
          algorithm: "secp256k1_ecdsa_sha256",
          private_key: "-----BEGIN PRIVATE KEY-----",
        },
      ]),
    ).toThrowError(/secret-like field/)
  })

  it("rejects fchain missing public_url", () => {
    expect(() => validateCosigners([{ kind: "fchain" }])).toThrowError(
      /public_url required/,
    )
  })

  it("rejects fchain with unknown scheme", () => {
    expect(() =>
      validateCosigners([
        {
          kind: "fchain",
          public_url: "https://fchain.lux.network",
          scheme: "snake-oil",
        },
      ]),
    ).toThrowError(/unknown scheme/)
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
