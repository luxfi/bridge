// Persistence + state-machine helpers for layered cosigners.
//
// Covers:
//   persistCosignerIntents   — create one CosignerStep per intent at swap-create
//   dispatchCosignersForSwap — read pending steps, dispatch, persist terminal state
//
// Prisma is mocked at the module level so unit tests never touch a real DB.
// Fireblocks SDK is mocked too — the dispatch path goes through runFireblocks
// which we've already proved out in cosigners-fireblocks.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vi.mock factories are hoisted above all const declarations, so any
// mock-fn references they capture have to come from vi.hoisted (which
// runs in the same hoisted block).
const mocks = vi.hoisted(() => ({
  cosignerStepCreate: vi.fn(),
  cosignerStepFindMany: vi.fn(),
  cosignerStepUpdate: vi.fn(),
  prismaTx: vi.fn(async (ops: unknown[]) => ops.map(() => null)),
  fbCreateTx: vi.fn(),
  fbGetTx: vi.fn(),
}))

vi.mock("@/prisma-instance", () => ({
  prisma: {
    cosignerStep: {
      create: mocks.cosignerStepCreate,
      findMany: mocks.cosignerStepFindMany,
      update: mocks.cosignerStepUpdate,
    },
    $transaction: mocks.prismaTx,
  },
}))

vi.mock("fireblocks-sdk", () => ({
  FireblocksSDK: class {
    createTransaction = mocks.fbCreateTx
    getTransactionById = mocks.fbGetTx
  },
  PeerType: { VAULT_ACCOUNT: "VAULT_ACCOUNT" },
  TransactionOperation: { RAW: "RAW" },
}))

const { cosignerStepCreate, cosignerStepFindMany, cosignerStepUpdate, prismaTx, fbCreateTx, fbGetTx } = mocks

import {
  dispatchCosignersForSwap,
  persistCosignerIntents,
  type CosignerIntent,
} from "../cosigners"

beforeEach(() => {
  process.env.FIREBLOCKS_COSIGNER_PEM__PUB_KEY = "stub-pem"
  process.env.FIREBLOCKS_COSIGNER_TIMEOUT_MS = "5000"
  cosignerStepCreate.mockReset()
  cosignerStepCreate.mockResolvedValue(undefined)
  cosignerStepFindMany.mockReset()
  cosignerStepUpdate.mockReset()
  cosignerStepUpdate.mockResolvedValue(undefined)
  prismaTx.mockClear()
  prismaTx.mockImplementation(async (ops: unknown[]) => ops.map(() => null))
  fbCreateTx.mockReset()
  fbGetTx.mockReset()
})

afterEach(() => {
  delete process.env.FIREBLOCKS_COSIGNER_PEM__PUB_KEY
  delete process.env.FIREBLOCKS_COSIGNER_TIMEOUT_MS
})

describe("persistCosignerIntents", () => {
  it("creates one CosignerStep row per intent in a single transaction", async () => {
    const intents: CosignerIntent[] = [
      { kind: "utila", org_id: "org-a", client_id: "cid-a", vault_id: "v1" },
      { kind: "fireblocks", api_key: "pub-key", vault_account_id: "0" },
    ]
    await persistCosignerIntents("swap_abc", intents)
    expect(prismaTx).toHaveBeenCalledTimes(1)
    // Two create() calls staged inside the transaction.
    expect(cosignerStepCreate).toHaveBeenCalledTimes(2)
    expect(cosignerStepCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        swap_id: "swap_abc",
        kind: "utila",
        public_id: "org-a",
        vault_id: "v1",
        status: "pending",
      },
    })
    expect(cosignerStepCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        swap_id: "swap_abc",
        kind: "fireblocks",
        public_id: "pub-key",
        vault_id: "0",
        status: "pending",
      },
    })
  })

  it("no-ops for empty intent array (no DB write, no log noise)", async () => {
    await persistCosignerIntents("swap_x", [])
    expect(prismaTx).not.toHaveBeenCalled()
    expect(cosignerStepCreate).not.toHaveBeenCalled()
  })
})

describe("dispatchCosignersForSwap", () => {
  it("returns no_steps when no pending rows exist", async () => {
    cosignerStepFindMany.mockResolvedValueOnce([])
    const v = await dispatchCosignersForSwap("swap_n", "0xabc", "0xtx")
    expect(v.aggregate).toBe("no_steps")
    expect(v.results).toEqual([])
    expect(v.failingReasons).toEqual([])
    expect(cosignerStepUpdate).not.toHaveBeenCalled()
  })

  it("returns all_approved when fireblocks step completes", async () => {
    cosignerStepFindMany.mockResolvedValueOnce([
      {
        id: 1,
        kind: "fireblocks",
        public_id: "pub-key",
        api_host: null,
        vault_id: "0",
      },
    ])
    fbCreateTx.mockResolvedValueOnce({ id: "fb_tx_1", status: "SUBMITTED" })
    fbGetTx.mockResolvedValueOnce({
      id: "fb_tx_1",
      status: "COMPLETED",
      signedMessages: [{ signature: { fullSig: "0xfeed" } }],
    })

    const v = await dispatchCosignersForSwap("swap_y", "0xnative", "0xtx")
    expect(v.aggregate).toBe("all_approved")
    expect(v.results).toHaveLength(1)
    expect(v.results[0]!.status).toBe("approved")
    expect(v.results[0]!.signature).toBe("0xfeed")
    expect(cosignerStepUpdate).toHaveBeenCalledTimes(1)
    expect(cosignerStepUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 1 },
      data: {
        status: "approved",
        signature: "0xfeed",
        external_id: "fb_tx_1",
      },
    })
  })

  it("returns any_rejected when fireblocks rejects + persists rejection reason", async () => {
    cosignerStepFindMany.mockResolvedValueOnce([
      {
        id: 7,
        kind: "fireblocks",
        public_id: "pub-key",
        api_host: null,
        vault_id: null,
      },
    ])
    fbCreateTx.mockResolvedValueOnce({ id: "fb_tx_x", status: "QUEUED" })
    fbGetTx.mockResolvedValueOnce({
      id: "fb_tx_x",
      status: "REJECTED",
      subStatus: "REJECTED_BY_USER",
    })

    const v = await dispatchCosignersForSwap("swap_z", "0xnative", "0xtx")
    expect(v.aggregate).toBe("any_rejected")
    expect(v.failingReasons[0]).toMatch(/fireblocks/)
    expect(v.failingReasons[0]).toMatch(/REJECTED_BY_USER/)
    expect(cosignerStepUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 7 },
      data: {
        status: "rejected",
        reason: expect.stringMatching(/REJECTED_BY_USER/) as string,
        external_id: "fb_tx_x",
      },
    })
  })

  it("returns any_failed (not any_rejected) when only failures present", async () => {
    cosignerStepFindMany.mockResolvedValueOnce([
      {
        id: 99,
        kind: "fireblocks",
        public_id: "pub-key",
        api_host: null,
        vault_id: null,
      },
    ])
    fbCreateTx.mockRejectedValueOnce(new Error("ECONNRESET"))

    const v = await dispatchCosignersForSwap("swap_f", "0xn", "0xtx")
    expect(v.aggregate).toBe("any_failed")
    expect(v.failingReasons[0]).toMatch(/ECONNRESET/)
  })

  it("preserves intent order across multiple steps", async () => {
    cosignerStepFindMany.mockResolvedValueOnce([
      {
        id: 10,
        kind: "fireblocks",
        public_id: "pub-key",
        api_host: null,
        vault_id: null,
      },
      {
        id: 11,
        kind: "fireblocks",
        public_id: "pub-key",
        api_host: null,
        vault_id: null,
      },
    ])
    // Both succeed.
    fbCreateTx
      .mockResolvedValueOnce({ id: "tx_a", status: "SUBMITTED" })
      .mockResolvedValueOnce({ id: "tx_b", status: "SUBMITTED" })
    fbGetTx
      .mockResolvedValueOnce({
        id: "tx_a",
        status: "COMPLETED",
        signedMessages: [{ signature: { fullSig: "0xaa" } }],
      })
      .mockResolvedValueOnce({
        id: "tx_b",
        status: "COMPLETED",
        signedMessages: [{ signature: { fullSig: "0xbb" } }],
      })

    const v = await dispatchCosignersForSwap("swap_p", "0xn", "0xtx")
    expect(v.aggregate).toBe("all_approved")
    expect(cosignerStepUpdate).toHaveBeenCalledTimes(2)
    expect(cosignerStepUpdate.mock.calls[0]?.[0]).toMatchObject({ where: { id: 10 } })
    expect(cosignerStepUpdate.mock.calls[1]?.[0]).toMatchObject({ where: { id: 11 } })
  })
})
