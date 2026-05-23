// Utila cosigner — happy / rejected / failed / timeout / no-vault.
//
// We mock `@luxfi/utila`'s createGrpcClient + serviceAccountAuthStrategy
// so the unit tests never touch the real API. The contract being tested
// is the Utila TransactionState_Enum partition + evm_personal_sign /
// getTransaction round-trip. Real types come from
// pkg/utila/src/lib/gen/utila/api/v1alpha2/...

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vi.mock factories are hoisted; pull the mock fns from vi.hoisted so
// they're defined in the same hoist block.
const mocks = vi.hoisted(() => ({
  initiateTransaction: vi.fn(),
  getTransaction: vi.fn(),
  createGrpcClient: vi.fn(),
  serviceAccountAuthStrategy: vi.fn().mockReturnValue("interceptor"),
}))

vi.mock("@luxfi/utila", () => ({
  createGrpcClient: mocks.createGrpcClient,
  serviceAccountAuthStrategy: mocks.serviceAccountAuthStrategy,
}))

// Fireblocks is unused in this test file but the cosigners.ts module
// imports it at the top — mock it to a no-op so module load doesn't
// trip on a missing constructor.
vi.mock("fireblocks-sdk", () => ({
  FireblocksSDK: vi.fn(),
  PeerType: { VAULT_ACCOUNT: "VAULT_ACCOUNT" },
  TransactionOperation: { RAW: "RAW" },
}))

import {
  dispatchCosigners,
  type UtilaCosignerIntent,
} from "../cosigners"

const intent: UtilaCosignerIntent = {
  kind: "utila",
  org_id: "service-account@tenant-x.utila.io",
  client_id: "0xfrom0000000000000000000000000000000000",
  vault_id: "1b25635a5b3f",
}

const opts = {
  swapId: "swap_utila_test",
  txHash: "0xdeadbeef" + "00".repeat(28),
  nativeSignature: "0xnative",
  cosigners: [intent],
}

// Bytes for an example 65-byte ECDSA signature, returned by Utila
// (Uint8Array on the wire, converted to 0x-hex by runUtila).
const sigBytes = new Uint8Array([
  0xfe, 0xed, 0xfa, 0xce, 0xde, 0xad, 0xbe, 0xef, 0xab, 0xcd, 0xef, 0x12,
  0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55,
  0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11,
  0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd,
  0xee, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99,
  0xaa, 0xbb, 0xcc, 0xdd, 0x1c,
])
const sigHex =
  "0x" +
  Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

beforeEach(() => {
  process.env.UTILA_COSIGNER_PEM__SERVICE_ACCOUNT_TENANT_X_UTILA_IO =
    "-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----"
  process.env.UTILA_COSIGNER_TIMEOUT_MS = "5000"
  mocks.initiateTransaction.mockReset()
  mocks.getTransaction.mockReset()
  mocks.createGrpcClient.mockReset()
  mocks.createGrpcClient.mockReturnValue({
    version: () => ({
      initiateTransaction: mocks.initiateTransaction,
      getTransaction: mocks.getTransaction,
    }),
  })
})

afterEach(() => {
  delete process.env.UTILA_COSIGNER_PEM__SERVICE_ACCOUNT_TENANT_X_UTILA_IO
  delete process.env.UTILA_COSIGNER_TIMEOUT_MS
})

describe("runUtila — happy path", () => {
  it("returns approved + signature when state reaches SIGNED (4)", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "vaults/v1/transactions/tx_a" },
    })
    mocks.getTransaction
      .mockResolvedValueOnce({ name: "tx_a", state: { state: 3 } }) // AWAITING_SIGNATURE
      .mockResolvedValueOnce({
        name: "tx_a",
        state: { state: 4 }, // SIGNED
        evmMessage: { signature: sigBytes },
      })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(sigHex)
    expect(result?.externalId).toBe("vaults/v1/transactions/tx_a")
  })

  it("treats CONFIRMED (13) as approved (sig already attested by SIGNED)", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_c" },
    })
    mocks.getTransaction.mockResolvedValueOnce({
      name: "tx_c",
      state: { state: 13 }, // CONFIRMED
      evmMessage: { signature: sigBytes },
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(sigHex)
  })

  it("keeps polling when state is SIGNED but signature not yet present", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_p" },
    })
    mocks.getTransaction
      // First poll: SIGNED but sig not propagated yet.
      .mockResolvedValueOnce({ name: "tx_p", state: { state: 4 } })
      // Second poll: same state + sig now populated.
      .mockResolvedValueOnce({
        name: "tx_p",
        state: { state: 4 },
        evmMessage: { signature: sigBytes },
      })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("approved")
    expect(result?.signature).toBe(sigHex)
  })
})

describe("runUtila — rejected", () => {
  it("returns rejected on DECLINED (9)", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_r" },
    })
    mocks.getTransaction.mockResolvedValueOnce({
      name: "tx_r",
      state: { state: 9 }, // DECLINED
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
    expect(result?.reason).toMatch(/DECLINED|TAP/)
    expect(result?.externalId).toBe("tx_r")
  })

  it("returns rejected on CANCELED (11)", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_cn" },
    })
    mocks.getTransaction.mockResolvedValueOnce({
      name: "tx_cn",
      state: { state: 11 },
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("rejected")
  })

  it("returns rejected on EXPIRED (15) or DROPPED (12)", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_e" },
    })
    mocks.getTransaction.mockResolvedValueOnce({
      name: "tx_e",
      state: { state: 15 },
    })
    const [result1] = await dispatchCosigners(opts)
    expect(result1?.status).toBe("rejected")

    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_d" },
    })
    mocks.getTransaction.mockResolvedValueOnce({
      name: "tx_d",
      state: { state: 12 },
    })
    const [result2] = await dispatchCosigners(opts)
    expect(result2?.status).toBe("rejected")
  })
})

describe("runUtila — failed", () => {
  it("returns failed on FAILED (8)", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_f" },
    })
    mocks.getTransaction.mockResolvedValueOnce({
      name: "tx_f",
      state: { state: 8 },
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/state=8|FAILED/)
  })

  it("returns failed when initiateTransaction throws", async () => {
    mocks.initiateTransaction.mockRejectedValueOnce(new Error("auth: bad jwt"))

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/bad jwt/)
  })

  it("returns failed when initiateTransaction returns no name", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({ transaction: {} })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/no transaction\.name/)
  })

  it("returns failed on timeout (stays in AWAITING_* past the ceiling)", async () => {
    process.env.UTILA_COSIGNER_TIMEOUT_MS = "200"
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_t" },
    })
    mocks.getTransaction.mockResolvedValue({
      name: "tx_t",
      state: { state: 2 }, // AWAITING_APPROVAL forever
    })

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/timed out/)
    expect(result?.externalId).toBe("tx_t")
  })

  it("returns failed when vault_id is missing (required for parent scope)", async () => {
    const [result] = await dispatchCosigners({
      ...opts,
      cosigners: [{ ...intent, vault_id: undefined }],
    })
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/vault_id/)
    // initiateTransaction must not have been called — we bailed early.
    expect(mocks.initiateTransaction).not.toHaveBeenCalled()
  })

  it("returns failed (env-var fallback missing) if no secret is configured", async () => {
    delete process.env.UTILA_COSIGNER_PEM__SERVICE_ACCOUNT_TENANT_X_UTILA_IO

    const [result] = await dispatchCosigners(opts)
    expect(result?.status).toBe("failed")
    expect(result?.reason).toMatch(/secret not in KMS/)
  })
})

describe("runUtila — wire shape", () => {
  it("calls initiateTransaction with evm_personal_sign + tenant vault parent", async () => {
    mocks.initiateTransaction.mockResolvedValueOnce({
      transaction: { name: "tx_w" },
    })
    mocks.getTransaction.mockResolvedValueOnce({
      name: "tx_w",
      state: { state: 4 },
      evmMessage: { signature: sigBytes },
    })

    await dispatchCosigners(opts)

    const call = mocks.initiateTransaction.mock.calls[0]?.[0] as {
      parent: string
      details: { details: { case: string; value: { fromAddress: string; messageHex: string } } }
      note: string
    }
    expect(call.parent).toBe(`vaults/${intent.vault_id}`)
    expect(call.details.details.case).toBe("evmPersonalSign")
    expect(call.details.details.value.fromAddress).toBe(intent.client_id)
    expect(call.details.details.value.messageHex).toBe(opts.txHash)
    expect(call.note).toMatch(/lux-bridge cosign swap=swap_utila_test/)
  })
})
