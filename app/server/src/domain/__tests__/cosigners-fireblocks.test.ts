// Fireblocks cosigner — happy / rejected / failed / timeout coverage.
//
// We mock `fireblocks-sdk` so the unit tests never touch the real API.
// The contract being tested is the *Fireblocks-SDK-shape contract*:
//   createTransaction(...) returns { id, status }
//   getTransactionById(id) returns { id, status, subStatus?, signedMessages?[] }
// runFireblocks polls getTransactionById on a 1.5s cadence until a
// terminal status, then returns a CosignResult.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock fireblocks-sdk BEFORE importing the module under test.
const createTx = vi.fn()
const getTx = vi.fn()

vi.mock("fireblocks-sdk", () => {
  return {
    FireblocksSDK: class {
      createTransaction = createTx
      getTransactionById = getTx
    },
    PeerType: { VAULT_ACCOUNT: "VAULT_ACCOUNT" },
    TransactionOperation: { RAW: "RAW" },
  }
})

import {
  dispatchCosigners,
  type FireblocksCosignerIntent,
} from "../cosigners"

const intent: FireblocksCosignerIntent = {
  kind: "fireblocks",
  api_key: "pub-key-id",
  vault_account_id: "0",
}

const opts = {
  swapId: "swap_test",
  txHash: "0xdeadbeef" + "00".repeat(28),
  nativeSignature: "0xabc123",
  cosigners: [intent],
}

beforeEach(() => {
  // Default — populate fetchCosignerSecret env-var fallback.
  process.env.FIREBLOCKS_COSIGNER_PEM__PUB_KEY_ID =
    "-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----"
  // Generous timeout default for happy / rejected / failed tests — they
  // resolve well before this; the dedicated timeout test overrides
  // this to a tight value so it doesn't make CI wait.
  process.env.FIREBLOCKS_COSIGNER_TIMEOUT_MS = "5000"
  createTx.mockReset()
  getTx.mockReset()
})

afterEach(() => {
  delete process.env.FIREBLOCKS_COSIGNER_PEM__PUB_KEY_ID
  delete process.env.FIREBLOCKS_COSIGNER_TIMEOUT_MS
})

describe("runFireblocks — happy path", () => {
  it("returns approved + signature when transaction reaches COMPLETED", async () => {
    createTx.mockResolvedValueOnce({ id: "tx_abc", status: "SUBMITTED" })
    getTx
      .mockResolvedValueOnce({ id: "tx_abc", status: "PENDING_SIGNATURE" })
      .mockResolvedValueOnce({
        id: "tx_abc",
        status: "COMPLETED",
        signedMessages: [
          { signature: { fullSig: "0xfeedface" } },
        ],
      })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe("0xfeedface")
    expect(result?.externalId).toBe("tx_abc")
  })

  it("treats BROADCASTING + CONFIRMING as complete (signature already attested)", async () => {
    createTx.mockResolvedValueOnce({ id: "tx_b", status: "SUBMITTED" })
    getTx.mockResolvedValueOnce({
      id: "tx_b",
      status: "BROADCASTING",
      signedMessages: [{ signature: { fullSig: "0xaabb" } }],
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe("0xaabb")
  })
})

describe("runFireblocks — rejected", () => {
  it("returns rejected when transaction status REJECTED", async () => {
    createTx.mockResolvedValueOnce({ id: "tx_r", status: "QUEUED" })
    getTx.mockResolvedValueOnce({
      id: "tx_r",
      status: "REJECTED",
      subStatus: "REJECTED_BY_USER",
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toContain("REJECTED")
    expect(result?.reason).toContain("REJECTED_BY_USER")
    expect(result?.externalId).toBe("tx_r")
  })

  it("returns rejected on CANCELLED", async () => {
    createTx.mockResolvedValueOnce({ id: "tx_c", status: "QUEUED" })
    getTx.mockResolvedValueOnce({ id: "tx_c", status: "CANCELLED" })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
  })

  it("returns rejected on BLOCKED (AML / compliance)", async () => {
    createTx.mockResolvedValueOnce({ id: "tx_x", status: "QUEUED" })
    getTx.mockResolvedValueOnce({
      id: "tx_x",
      status: "BLOCKED",
      subStatus: "BLOCKED_BY_POLICY",
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toContain("BLOCKED_BY_POLICY")
  })
})

describe("runFireblocks — failed / transient", () => {
  it("returns failed when transaction status FAILED", async () => {
    createTx.mockResolvedValueOnce({ id: "tx_f", status: "QUEUED" })
    getTx.mockResolvedValueOnce({
      id: "tx_f",
      status: "FAILED",
      subStatus: "INSUFFICIENT_FUNDS",
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toContain("FAILED")
  })

  it("returns failed when COMPLETED has no signature (Fireblocks bug guard)", async () => {
    createTx.mockResolvedValueOnce({ id: "tx_z", status: "QUEUED" })
    getTx.mockResolvedValueOnce({
      id: "tx_z",
      status: "COMPLETED",
      signedMessages: [], // unusual but must be guarded
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toContain("no signature in signedMessages")
  })

  it("returns failed when createTransaction throws", async () => {
    createTx.mockRejectedValueOnce(new Error("network: ECONNRESET"))

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toContain("ECONNRESET")
  })

  it("returns failed on timeout (stays in PENDING_* past the ceiling)", async () => {
    // Tight timeout just for this test so CI doesn't wait the default 5s.
    process.env.FIREBLOCKS_COSIGNER_TIMEOUT_MS = "200"
    createTx.mockResolvedValueOnce({ id: "tx_t", status: "SUBMITTED" })
    getTx.mockResolvedValue({ id: "tx_t", status: "PENDING_SIGNATURE" })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/timed out/)
    expect(result?.externalId).toBe("tx_t")
  })

  it("returns failed (env-var fallback missing) if no secret is configured", async () => {
    delete process.env.FIREBLOCKS_COSIGNER_PEM__PUB_KEY_ID

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/cosigner secret unavailable/)
  })
})
