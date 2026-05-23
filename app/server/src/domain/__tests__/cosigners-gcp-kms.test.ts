// GCP Cloud KMS cosigner — happy / structured-error / algorithm-mismatch.
//
// Mocks @google-cloud/kms's KeyManagementServiceClient. Tests:
//   1. CloudSigner interface contract: returns CloudSignResult shape
//   2. SHA-256 digest convention (cloudHsmDigest)
//   3. asymmetricSign(name, { sha256: digest }) is the right call
//   4. GCP gRPC error codes map cleanly to CloudSignerErrorCode:
//        7 (PERMISSION_DENIED) → permission_denied → rejected
//       16 (UNAUTHENTICATED)   → permission_denied → rejected
//        5 (NOT_FOUND)         → key_not_found     → rejected
//        9 (FAILED_PRECONDITION)→ key_disabled     → rejected
//        8 (RESOURCE_EXHAUSTED)→ rate_limited     → failed
//       14 (UNAVAILABLE)       → provider_unavailable → failed
//   5. Algorithm allow-list enforcement (only secp256k1_ecdsa_sha256 wired)
//   6. NO SA-JSON-in-env fallback — workload identity ONLY

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  asymmetricSign: vi.fn(),
  KeyManagementServiceClient: vi.fn(),
  // Unused for these tests but needed because cosigners.ts also imports
  // them at module level.
  initiateTransaction: vi.fn(),
  getTransaction: vi.fn(),
  createGrpcClient: vi.fn(),
  serviceAccountAuthStrategy: vi.fn().mockReturnValue("interceptor"),
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

import {
  cloudHsmDigest,
  dispatchCosigners,
  type CloudHsmCosignerIntent,
} from "../cosigners"
import { createHash } from "crypto"

const KEY_REF =
  "projects/p/locations/global/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1"

const intent: CloudHsmCosignerIntent = {
  kind: "cloud_hsm",
  provider: "gcp_kms",
  key_ref: KEY_REF,
  algorithm: "secp256k1_ecdsa_sha256",
}

const txHash = "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"

const opts = {
  swapId: "swap_gcp_test",
  txHash,
  nativeSignature: "0xnative",
  cosigners: [intent],
}

const stubSig = new Uint8Array(64).fill(0xab)

beforeEach(() => {
  mocks.asymmetricSign.mockReset()
  mocks.KeyManagementServiceClient.mockReset()
  mocks.KeyManagementServiceClient.mockImplementation(() => ({
    asymmetricSign: mocks.asymmetricSign,
  }))
})

afterEach(() => {})

// ── digest convention ───────────────────────────────────────────────────

describe("cloudHsmDigest", () => {
  it("is SHA-256 over the txHash bytes (without 0x prefix)", () => {
    const want = createHash("sha256")
      .update(Buffer.from(txHash.slice(2), "hex"))
      .digest()
    expect(cloudHsmDigest(txHash)).toEqual(want)
  })

  it("accepts bare hex as well as 0x-prefixed", () => {
    expect(cloudHsmDigest("0xdeadbeef")).toEqual(cloudHsmDigest("deadbeef"))
  })
})

// ── happy path ──────────────────────────────────────────────────────────

describe("runCloudHsm — gcp_kms happy path", () => {
  it("signs via workload identity (no creds passed to client ctor)", async () => {
    mocks.asymmetricSign.mockResolvedValueOnce([{ signature: stubSig }])

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(
      "0x" + Buffer.from(stubSig).toString("hex"),
    )
    expect(result?.externalId).toBe(KEY_REF)

    // Verify the call: asymmetricSign called with key_ref + SHA-256 digest.
    expect(mocks.asymmetricSign).toHaveBeenCalledTimes(1)
    const callArg = mocks.asymmetricSign.mock.calls[0]?.[0] as {
      name: string
      digest: { sha256: Buffer }
    }
    expect(callArg.name).toBe(KEY_REF)
    expect(callArg.digest.sha256).toEqual(cloudHsmDigest(txHash))

    // Workload-identity path — KeyManagementServiceClient constructed
    // with NO arguments (no credentials).
    expect(mocks.KeyManagementServiceClient).toHaveBeenCalledWith()
  })

  it("decodes base64 signature when the API returns it as a string", async () => {
    const sigB64 = Buffer.from(stubSig).toString("base64")
    mocks.asymmetricSign.mockResolvedValueOnce([{ signature: sigB64 }])

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(
      "0x" + Buffer.from(stubSig).toString("hex"),
    )
  })

  it("identity_hint is forwarded but does not become credentials", async () => {
    mocks.asymmetricSign.mockResolvedValueOnce([{ signature: stubSig }])

    await dispatchCosigners({
      ...opts,
      cosigners: [
        {
          ...intent,
          identity_hint: "sa@tenant.iam.gserviceaccount.com",
        },
      ],
    })

    // No credentials passed — identity_hint is non-secret context only.
    expect(mocks.KeyManagementServiceClient).toHaveBeenCalledWith()
  })
})

// ── structured-error mapping ─────────────────────────────────────────────

describe("runCloudHsm — gcp_kms error mapping", () => {
  it("gRPC code 7 PERMISSION_DENIED → rejected/permission_denied", async () => {
    mocks.asymmetricSign.mockRejectedValueOnce(
      Object.assign(new Error("Caller does not have permission"), { code: 7 }),
    )

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/permission_denied/)
  })

  it("gRPC code 16 UNAUTHENTICATED → rejected/permission_denied", async () => {
    mocks.asymmetricSign.mockRejectedValueOnce(
      Object.assign(new Error("invalid grant"), { code: 16 }),
    )

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/permission_denied/)
  })

  it("gRPC code 5 NOT_FOUND → rejected/key_not_found", async () => {
    mocks.asymmetricSign.mockRejectedValueOnce(
      Object.assign(new Error("Key not found"), { code: 5 }),
    )

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/key_not_found/)
  })

  it("gRPC code 9 FAILED_PRECONDITION → rejected/key_disabled", async () => {
    mocks.asymmetricSign.mockRejectedValueOnce(
      Object.assign(new Error("Key is disabled"), { code: 9 }),
    )

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/key_disabled/)
  })

  it("gRPC code 8 RESOURCE_EXHAUSTED → failed/rate_limited", async () => {
    mocks.asymmetricSign.mockRejectedValueOnce(
      Object.assign(new Error("Quota exceeded"), { code: 8 }),
    )

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/rate_limited/)
  })

  it("gRPC code 14 UNAVAILABLE → failed/provider_unavailable", async () => {
    mocks.asymmetricSign.mockRejectedValueOnce(
      Object.assign(new Error("backend unavailable"), { code: 14 }),
    )

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/provider_unavailable/)
  })

  it("unknown error → failed/network_error (fallback bucket)", async () => {
    // No gRPC code and no recognised string pattern → falls through
    // to network_error. `unreachable` and `UNAVAILABLE` match earlier
    // branches, so use a generic transport error string.
    mocks.asymmetricSign.mockRejectedValueOnce(
      new Error("ECONNRESET: socket hang up"),
    )

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/network_error/)
  })

  it("API returns no signature → failed/provider_unavailable", async () => {
    mocks.asymmetricSign.mockResolvedValueOnce([{}])

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/no signature/)
  })
})

// ── algorithm allow-list ─────────────────────────────────────────────────

describe("runCloudHsm — algorithm allow-list", () => {
  it("rejects algorithms that aren't wired for gcp_kms yet", async () => {
    const [result] = await dispatchCosigners({
      ...opts,
      cosigners: [{ ...intent, algorithm: "ed25519" }],
    })
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/algorithm_mismatch/)
    expect(mocks.asymmetricSign).not.toHaveBeenCalled()
  })
})

// Real-adapter tests for AWS / Azure / Vault Transit / f-chain live in
// cosigners-aws-azure-vault-fchain.test.ts — they mock the provider SDKs
// (and globalThis.fetch for the HTTP-direct adapters) the same way this
// file mocks @google-cloud/kms.
