// Real-adapter tests for AWS KMS, Azure Key Vault, Vault Transit, f-chain.
//
// All four adapters mocked at the module level so unit tests never touch
// real cloud APIs. The contracts being tested:
//   1. Each adapter calls its provider with the right shape (key + digest
//      + algorithm normalization).
//   2. Provider-native errors map cleanly to CloudSignerErrorCode → stable
//      CosignResult.status semantics.
//   3. Algorithm allow-list is enforced before any network call.
//   4. Vault Transit auth requires both VAULT_ADDR + VAULT_TOKEN.
//   5. f-chain uses fetch against /v1/fhe/encrypt and treats the
//      ciphertext as the signature blob.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vi.mock factories are hoisted; pull mock fns from vi.hoisted.
const mocks = vi.hoisted(() => ({
  // AWS
  awsSend: vi.fn(),
  KMSClient: vi.fn(),
  SignCommand: vi.fn(function (args: unknown) { return { __cmd: "Sign", args } }),
  // Azure
  azureSign: vi.fn(),
  CryptographyClient: vi.fn(),
  DefaultAzureCredential: vi.fn(),
  // unused by these tests but cosigners.ts imports them at module level
  initiateTransaction: vi.fn(),
  getTransaction: vi.fn(),
  createGrpcClient: vi.fn(),
  serviceAccountAuthStrategy: vi.fn().mockReturnValue("interceptor"),
  asymmetricSign: vi.fn(),
  KeyManagementServiceClient: vi.fn(),
}))

vi.mock("@aws-sdk/client-kms", () => ({
  KMSClient: mocks.KMSClient,
  SignCommand: mocks.SignCommand,
}))

vi.mock("@azure/keyvault-keys", () => ({
  CryptographyClient: mocks.CryptographyClient,
}))

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: mocks.DefaultAzureCredential,
}))

vi.mock("@google-cloud/kms", () => ({
  KeyManagementServiceClient: mocks.KeyManagementServiceClient,
}))

vi.mock("@luxfi/utila", () => ({
  createGrpcClient: mocks.createGrpcClient,
  serviceAccountAuthStrategy: mocks.serviceAccountAuthStrategy,
}))

vi.mock("fireblocks-sdk", () => ({
  FireblocksSDK: vi.fn(),
  PeerType: { VAULT_ACCOUNT: "VAULT_ACCOUNT" },
  TransactionOperation: { RAW: "RAW" },
}))

import { dispatchCosigners } from "../cosigners"

const txHash =
  "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"

const baseOpts = {
  swapId: "swap_test",
  txHash,
  nativeSignature: "0xnative",
}

const stubSig = new Uint8Array(64).fill(0xab)
const stubSigHex = "0x" + Buffer.from(stubSig).toString("hex")

beforeEach(() => {
  mocks.awsSend.mockReset()
  mocks.KMSClient.mockReset()
  mocks.KMSClient.mockImplementation(function () { return { send: mocks.awsSend } })
  mocks.azureSign.mockReset()
  mocks.CryptographyClient.mockReset()
  mocks.CryptographyClient.mockImplementation(function () { return { sign: mocks.azureSign } })
  mocks.DefaultAzureCredential.mockReset()
  mocks.DefaultAzureCredential.mockImplementation(function () { return {} })
})

afterEach(() => {
  delete process.env.VAULT_ADDR
  delete process.env.VAULT_TOKEN
  delete process.env.FCHAIN_COSIGNER_TIMEOUT_MS
})

// ────────────────────────────────────────────────────────────────────────
//  AWS KMS
// ────────────────────────────────────────────────────────────────────────

describe("runCloudHsm — aws_kms happy path", () => {
  it("signs via SignCommand with ECDSA_SHA_256 + region from ARN", async () => {
    mocks.awsSend.mockResolvedValueOnce({
      Signature: stubSig,
      KeyId:
        "arn:aws:kms:us-east-1:111:key/00000000-0000-0000-0000-000000000000",
    })
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref:
            "arn:aws:kms:us-east-1:111:key/00000000-0000-0000-0000-000000000000",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(stubSigHex)
    expect(result?.externalId).toBe(
      "arn:aws:kms:us-east-1:111:key/00000000-0000-0000-0000-000000000000",
    )
    expect(mocks.KMSClient).toHaveBeenCalledWith({ region: "us-east-1" })
    const cmd = mocks.awsSend.mock.calls[0]?.[0] as {
      args: { KeyId: string; MessageType: string; SigningAlgorithm: string }
    }
    expect(cmd.args.MessageType).toBe("DIGEST")
    expect(cmd.args.SigningAlgorithm).toBe("ECDSA_SHA_256")
  })

  it("rsa_pss_sha256 → RSASSA_PSS_SHA_256", async () => {
    mocks.awsSend.mockResolvedValueOnce({ Signature: stubSig })
    await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref: "arn:aws:kms:eu-west-1:111:key/abc",
          algorithm: "rsa_pss_sha256",
        },
      ],
    })
    const cmd = mocks.awsSend.mock.calls[0]?.[0] as { args: { SigningAlgorithm: string } }
    expect(cmd.args.SigningAlgorithm).toBe("RSASSA_PSS_SHA_256")
  })

  it("identityHint overrides region from ARN", async () => {
    mocks.awsSend.mockResolvedValueOnce({ Signature: stubSig })
    await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref: "arn:aws:kms:us-east-1:111:key/abc",
          algorithm: "secp256k1_ecdsa_sha256",
          identity_hint: "us-west-2",
        },
      ],
    })
    expect(mocks.KMSClient).toHaveBeenCalledWith({ region: "us-west-2" })
  })
})

describe("runCloudHsm — aws_kms error mapping", () => {
  it("AccessDeniedException → rejected/permission_denied", async () => {
    mocks.awsSend.mockRejectedValueOnce(
      Object.assign(new Error("User is not authorized"), {
        name: "AccessDeniedException",
        $metadata: { httpStatusCode: 403 },
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref: "arn:aws:kms:us-east-1:111:key/abc",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/permission_denied/)
  })

  it("NotFoundException → rejected/key_not_found", async () => {
    mocks.awsSend.mockRejectedValueOnce(
      Object.assign(new Error("Key does not exist"), {
        name: "NotFoundException",
        $metadata: { httpStatusCode: 404 },
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref: "arn:aws:kms:us-east-1:111:key/abc",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/key_not_found/)
  })

  it("KMSInvalidStateException → rejected/key_disabled", async () => {
    mocks.awsSend.mockRejectedValueOnce(
      Object.assign(new Error("Key is in disabled state"), {
        name: "KMSInvalidStateException",
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref: "arn:aws:kms:us-east-1:111:key/abc",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/key_disabled/)
  })

  it("ThrottlingException → failed/rate_limited", async () => {
    mocks.awsSend.mockRejectedValueOnce(
      Object.assign(new Error("Rate exceeded"), {
        name: "ThrottlingException",
        $metadata: { httpStatusCode: 429 },
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref: "arn:aws:kms:us-east-1:111:key/abc",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/rate_limited/)
  })

  it("rejects unsupported algorithm BEFORE any network call", async () => {
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "aws_kms",
          key_ref: "arn:aws:kms:us-east-1:111:key/abc",
          algorithm: "ed25519",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/algorithm_mismatch/)
    expect(mocks.awsSend).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────
//  Azure Key Vault
// ────────────────────────────────────────────────────────────────────────

describe("runCloudHsm — azure_key_vault happy path", () => {
  it("signs via CryptographyClient.sign('ES256K') + returns key version", async () => {
    mocks.azureSign.mockResolvedValueOnce({
      result: stubSig,
      keyID: "https://v.vault.azure.net/keys/k/abcdef1234",
    })
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "azure_key_vault",
          key_ref: "https://v.vault.azure.net/keys/k",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(stubSigHex)
    expect(result?.externalId).toBe("https://v.vault.azure.net/keys/k/abcdef1234")

    expect(mocks.CryptographyClient).toHaveBeenCalledWith(
      "https://v.vault.azure.net/keys/k",
      expect.anything(),
    )
    const sigCall = mocks.azureSign.mock.calls[0] as [string, Uint8Array]
    expect(sigCall[0]).toBe("ES256K")
    expect(sigCall[1]).toBeInstanceOf(Buffer)
  })

  it("rsa_pss_sha256 → 'PS256'", async () => {
    mocks.azureSign.mockResolvedValueOnce({ result: stubSig })
    await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "azure_key_vault",
          key_ref: "https://v.vault.azure.net/keys/k",
          algorithm: "rsa_pss_sha256",
        },
      ],
    })
    expect(mocks.azureSign.mock.calls[0]?.[0]).toBe("PS256")
  })
})

describe("runCloudHsm — azure_key_vault error mapping", () => {
  it("Forbidden → rejected/permission_denied", async () => {
    mocks.azureSign.mockRejectedValueOnce(
      Object.assign(new Error("Caller is not authorized"), {
        code: "Forbidden",
        statusCode: 403,
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "azure_key_vault",
          key_ref: "https://v.vault.azure.net/keys/k",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/permission_denied/)
  })

  it("KeyNotFound → rejected/key_not_found", async () => {
    mocks.azureSign.mockRejectedValueOnce(
      Object.assign(new Error("Key not found"), {
        code: "KeyNotFound",
        statusCode: 404,
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "azure_key_vault",
          key_ref: "https://v.vault.azure.net/keys/k",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/key_not_found/)
  })

  it("ServiceUnavailable → failed/provider_unavailable", async () => {
    mocks.azureSign.mockRejectedValueOnce(
      Object.assign(new Error("Vault is unavailable"), {
        code: "ServiceUnavailable",
        statusCode: 503,
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "azure_key_vault",
          key_ref: "https://v.vault.azure.net/keys/k",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/provider_unavailable/)
  })
})

// ────────────────────────────────────────────────────────────────────────
//  Vault Transit
// ────────────────────────────────────────────────────────────────────────

describe("runCloudHsm — vault_transit", () => {
  it("requires VAULT_ADDR + VAULT_TOKEN", async () => {
    // Neither env set.
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "vault_transit",
          key_ref: "transit/keys/bridge-key",
          algorithm: "ed25519",
        },
      ],
    })
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/VAULT_ADDR/)
  })

  it("signs via POST /v1/transit/sign/<name> and unwraps vault:vN:<base64>", async () => {
    process.env.VAULT_ADDR = "https://vault.example"
    process.env.VAULT_TOKEN = "s.token123"

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            signature: "vault:v3:" + Buffer.from(stubSig).toString("base64"),
            key_version: 3,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "vault_transit",
          key_ref: "transit/keys/bridge-key",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })

    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(stubSigHex)
    expect(result?.externalId).toBe("v3")
    // Verify URL + headers + body shape.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe("https://vault.example/v1/transit/sign/bridge-key")
    expect((init as RequestInit).headers).toEqual({
      "X-Vault-Token": "s.token123",
      "Content-Type": "application/json",
    })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      hash_algorithm: "sha2-256",
      prehashed: true,
      marshaling_algorithm: "asn1",
    })
    expect(typeof body.input).toBe("string")
    fetchSpy.mockRestore()
  })

  it("401 → rejected/permission_denied", async () => {
    process.env.VAULT_ADDR = "https://vault.example"
    process.env.VAULT_TOKEN = "bad"
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response('{"errors":["permission denied"]}', { status: 403 }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "vault_transit",
          key_ref: "transit/keys/k",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/permission_denied/)
    fetchSpy.mockRestore()
  })

  it("invalid keyRef without /keys/ → rejected/invalid_digest", async () => {
    process.env.VAULT_ADDR = "https://vault.example"
    process.env.VAULT_TOKEN = "s.token"
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "cloud_hsm",
          provider: "vault_transit",
          key_ref: "malformed-ref",
          algorithm: "secp256k1_ecdsa_sha256",
        },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/invalid_digest/)
  })
})

// ────────────────────────────────────────────────────────────────────────
//  f-chain (FHE attestation)
// ────────────────────────────────────────────────────────────────────────

describe("runFChain — Lux f-chain FHE attestation", () => {
  it("POSTs txHash to /v1/fhe/encrypt and treats ciphertext as signature", async () => {
    const ciphertext = "deadbeef".repeat(8)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ciphertext_hex: ciphertext,
          session_id: "sess_xyz",
          scheme: "ckks",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        {
          kind: "fchain",
          public_url: "https://fchain.lux.network",
          scheme: "ckks",
        },
      ],
    })

    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe("0x" + ciphertext)
    expect(result?.externalId).toBe("sess_xyz")

    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe("https://fchain.lux.network/v1/fhe/encrypt")
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.plaintext_hex).toBe(txHash.slice(2))
    expect(body.scheme).toBe("ckks")
    fetchSpy.mockRestore()
  })

  it("403 from f-chain → rejected (policy denial)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("forbidden", { status: 403 }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        { kind: "fchain", public_url: "https://fchain.lux.network" },
      ],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/fchain status=403/)
    fetchSpy.mockRestore()
  })

  it("500 from f-chain → failed (retryable infra)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("internal", { status: 500 }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        { kind: "fchain", public_url: "https://fchain.lux.network" },
      ],
    })
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/fchain status=500/)
    fetchSpy.mockRestore()
  })

  it("network error / abort → failed", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        { kind: "fchain", public_url: "https://fchain.lux.network" },
      ],
    })
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/ECONNREFUSED|fchain encrypt POST failed/)
    fetchSpy.mockRestore()
  })

  it("missing ciphertext_hex → failed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ session_id: "x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const [result] = await dispatchCosigners({
      ...baseOpts,
      cosigners: [
        { kind: "fchain", public_url: "https://fchain.lux.network" },
      ],
    })
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/missing ciphertext_hex/)
    fetchSpy.mockRestore()
  })
})
