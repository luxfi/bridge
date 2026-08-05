// fetchCosignerSecret — real Lux KMS round-trip with env-var fallback.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  _resetKmsClientForTests,
  fetchCosignerSecret,
} from "../cosigners"

// Mocks for the upstream deps cosigners.ts imports — needed because the
// module-level imports otherwise try to instantiate real clients.
vi.mock("fireblocks-sdk", () => ({
  FireblocksSDK: vi.fn(),
  PeerType: { VAULT_ACCOUNT: "VAULT_ACCOUNT" },
  TransactionOperation: { RAW: "RAW" },
}))
vi.mock("@google-cloud/kms", () => ({
  KeyManagementServiceClient: vi.fn(),
}))
vi.mock("@aws-sdk/client-kms", () => ({
  KMSClient: vi.fn(),
  SignCommand: vi.fn(),
}))
vi.mock("@azure/keyvault-keys", () => ({
  CryptographyClient: vi.fn(),
}))
vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn(),
}))
vi.mock("@luxfi/utila", () => ({
  createGrpcClient: vi.fn(),
  serviceAccountAuthStrategy: vi.fn(),
}))

beforeEach(() => {
  _resetKmsClientForTests()
})
afterEach(() => {
  delete process.env.BRIDGE_KMS_URL
  delete process.env.BRIDGE_KMS_ORG
  delete process.env.BRIDGE_IAM_ISSUER
  delete process.env.BRIDGE_IAM_CLIENT_ID
  delete process.env.BRIDGE_IAM_CLIENT_SECRET
  delete process.env.UTILA_COSIGNER_PEM__ORG_A
  delete process.env.FIREBLOCKS_COSIGNER_PEM__PUB_KEY
  vi.restoreAllMocks()
})

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  })
}

describe("fetchCosignerSecret — KMS-backed", () => {
  it("reads utila PEM from bridge/cosigners/utila/{org}/sa_pem when KMS is configured", async () => {
    process.env.BRIDGE_KMS_URL = "https://kms.lux.cloud"
    process.env.BRIDGE_KMS_ORG = "lux"
    process.env.BRIDGE_IAM_ISSUER = "https://iam.lux.network"
    process.env.BRIDGE_IAM_CLIENT_ID = "lux-bridge"
    process.env.BRIDGE_IAM_CLIENT_SECRET = "test"

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(textResponse("UTILA-PEM-BYTES"))

    const pem = await fetchCosignerSecret({
      kind: "utila",
      org_id: "org-a",
      client_id: "cid",
    })
    expect(pem).toBe("UTILA-PEM-BYTES")
    const url = fetchSpy.mock.calls[1]?.[0] as string
    expect(url).toBe(
      "https://kms.lux.cloud/v1/kms/orgs/lux/secrets/bridge/cosigners/utila/ORG_A/sa_pem",
    )
  })

  it("reads fireblocks PEM from bridge/cosigners/fireblocks/{api_key}/secret_pem", async () => {
    process.env.BRIDGE_KMS_URL = "https://kms.lux.cloud"
    process.env.BRIDGE_KMS_ORG = "lux"
    process.env.BRIDGE_IAM_ISSUER = "https://iam.lux.network"
    process.env.BRIDGE_IAM_CLIENT_ID = "lux-bridge"
    process.env.BRIDGE_IAM_CLIENT_SECRET = "test"

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(textResponse("FB-PEM"))

    const pem = await fetchCosignerSecret({
      kind: "fireblocks",
      api_key: "pub-key",
    })
    expect(pem).toBe("FB-PEM")
    const url = fetchSpy.mock.calls[1]?.[0] as string
    expect(url).toBe(
      "https://kms.lux.cloud/v1/kms/orgs/lux/secrets/bridge/cosigners/fireblocks/PUB_KEY/secret_pem",
    )
  })

  it("falls back to env var when KMS returns 404", async () => {
    process.env.BRIDGE_KMS_URL = "https://kms.lux.cloud"
    process.env.BRIDGE_KMS_ORG = "lux"
    process.env.BRIDGE_IAM_ISSUER = "https://iam.lux.network"
    process.env.BRIDGE_IAM_CLIENT_ID = "lux-bridge"
    process.env.BRIDGE_IAM_CLIENT_SECRET = "test"
    process.env.UTILA_COSIGNER_PEM__ORG_A = "DEV-PEM-FROM-ENV"

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))

    const pem = await fetchCosignerSecret({
      kind: "utila",
      org_id: "org-a",
      client_id: "cid",
    })
    expect(pem).toBe("DEV-PEM-FROM-ENV")
  })

  it("uses env-var fallback when KMS is NOT configured (no BRIDGE_KMS_URL)", async () => {
    process.env.FIREBLOCKS_COSIGNER_PEM__PUB_KEY = "LOCAL-DEV-PEM"

    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const pem = await fetchCosignerSecret({
      kind: "fireblocks",
      api_key: "pub-key",
    })
    expect(pem).toBe("LOCAL-DEV-PEM")
    // Never hit the network — KMS wasn't configured.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("throws cleanly when neither KMS nor env var has the secret", async () => {
    await expect(
      fetchCosignerSecret({
        kind: "utila",
        org_id: "missing-org",
        client_id: "cid",
      }),
    ).rejects.toThrow(/cosigner secret unavailable/)
  })

  it("non-404 KMS error propagates (retryable on the caller side)", async () => {
    process.env.BRIDGE_KMS_URL = "https://kms.lux.cloud"
    process.env.BRIDGE_KMS_ORG = "lux"
    process.env.BRIDGE_IAM_ISSUER = "https://iam.lux.network"
    process.env.BRIDGE_IAM_CLIENT_ID = "lux-bridge"
    process.env.BRIDGE_IAM_CLIENT_SECRET = "test"

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response("upstream timeout", { status: 504 }))

    await expect(
      fetchCosignerSecret({
        kind: "utila",
        org_id: "org-a",
        client_id: "cid",
      }),
    ).rejects.toThrow(/504/)
  })

  it("rejects cloud_hsm / fchain kinds (defensive — they use workload identity)", async () => {
    await expect(
      fetchCosignerSecret({
        kind: "cloud_hsm",
        provider: "gcp_kms",
        key_ref: "k",
        algorithm: "secp256k1_ecdsa_sha256",
      }),
    ).rejects.toThrow(/workload identity/)
    await expect(
      fetchCosignerSecret({
        kind: "fchain",
        public_url: "https://fchain.lux.network",
      }),
    ).rejects.toThrow(/workload identity/)
  })
})
