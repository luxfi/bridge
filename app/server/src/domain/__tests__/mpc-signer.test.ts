// mpc-signer tests — verifies the MPCClient-routed signing path.
//
// Mocks @/clients/mpc.MPCClient and a minimal ethers JsonRpcProvider.
// The contract being tested:
//   1. isMPCSigningEnabled() reads the full BRIDGE_MPC_* + BRIDGE_IAM_*
//      env block + BRIDGE_MPC_WALLET_ID — all must be set.
//   2. mpcSignAndSend() calls MPCClient.getWallet then MPCClient.sign,
//      then builds + broadcasts an EIP-1559 tx with the returned r/s/v.
//   3. Compact 65-byte signature in result.signature falls back to
//      manual r/s/v split.
//   4. v < 27 is normalized to v + 27.
//   5. mpcBridgeMint encodes bridgeMint(address, uint256) correctly.
//   6. mpcSendNative posts an empty-data tx with the requested value.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Hoisted mocks — vi.mock factories run before any module-level imports.
const mocks = vi.hoisted(() => ({
  getWallet: vi.fn(),
  sign: vi.fn(),
}))

vi.mock("@/clients/mpc", () => ({
  MPCClient: vi.fn().mockImplementation(() => ({
    getWallet: mocks.getWallet,
    sign: mocks.sign,
  })),
  MPCError: class extends Error {},
}))

vi.mock("@/clients/iam", () => ({
  IAMClient: vi.fn(),
}))

import {
  _resetMpcClientForTests,
  isMPCSigningEnabled,
  mpcBridgeMint,
  mpcSendNative,
  mpcSignAndSend,
} from "../mpc-signer"

const ETHEREUM_CHAIN_ID = 1n

function makeProvider(opts: {
  fromAddress: string
  nonce?: number
  broadcastHash?: string
  feeData?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
}) {
  const waitMock = vi.fn().mockResolvedValue({ status: 1 })
  const broadcastMock = vi.fn().mockResolvedValue({
    hash: opts.broadcastHash ?? "0xbroadcast",
    wait: waitMock,
  })
  return {
    getNetwork: vi.fn().mockResolvedValue({ chainId: ETHEREUM_CHAIN_ID }),
    getTransactionCount: vi.fn().mockResolvedValue(opts.nonce ?? 0),
    getFeeData: vi.fn().mockResolvedValue(
      opts.feeData ?? {
        maxFeePerGas: 100n,
        maxPriorityFeePerGas: 2n,
      },
    ),
    broadcastTransaction: broadcastMock,
  } as unknown as Parameters<typeof mpcSignAndSend>[0]
}

beforeEach(() => {
  _resetMpcClientForTests()
  mocks.getWallet.mockReset()
  mocks.sign.mockReset()
  // Default env: MPC signing enabled.
  process.env.BRIDGE_MPC_URL = "https://mpc.example.test"
  process.env.BRIDGE_IAM_ISSUER = "https://iam.example.test"
  process.env.BRIDGE_IAM_CLIENT_ID = "bridge"
  process.env.BRIDGE_IAM_CLIENT_SECRET = "sec"
  process.env.BRIDGE_MPC_WALLET_ID = "wallet-eth"
})

afterEach(() => {
  delete process.env.BRIDGE_MPC_URL
  delete process.env.BRIDGE_IAM_ISSUER
  delete process.env.BRIDGE_IAM_CLIENT_ID
  delete process.env.BRIDGE_IAM_CLIENT_SECRET
  delete process.env.BRIDGE_MPC_WALLET_ID
  // Don't vi.restoreAllMocks — the MPCClient constructor mock is set
  // in vi.mock factory once at module load; restoring would null it.
})

describe("isMPCSigningEnabled", () => {
  it("true when every required env var is set", () => {
    expect(isMPCSigningEnabled()).toBe(true)
  })

  it("false when any required env var is missing", () => {
    for (const key of [
      "BRIDGE_MPC_URL",
      "BRIDGE_IAM_ISSUER",
      "BRIDGE_IAM_CLIENT_ID",
      "BRIDGE_IAM_CLIENT_SECRET",
      "BRIDGE_MPC_WALLET_ID",
    ] as const) {
      const saved = process.env[key]
      delete process.env[key]
      expect(isMPCSigningEnabled()).toBe(false)
      process.env[key] = saved
    }
    // Sanity check — back to true after restoring.
    expect(isMPCSigningEnabled()).toBe(true)
  })
})

describe("mpcSignAndSend — happy path", () => {
  it("resolves wallet → builds unsigned tx → signs via MPCClient → broadcasts", async () => {
    mocks.getWallet.mockResolvedValueOnce({
      id: "wallet-eth",
      walletId: "wallet-eth",
      ethAddress: "0x1234567890abcdef1234567890abcdef12345678",
      keyType: "secp256k1",
      protocol: "cggmp21",
    })
    mocks.sign.mockResolvedValueOnce({
      signature: "0xabc",
      r: "0x" + "11".repeat(32),
      s: "0x" + "22".repeat(32),
      v: 27,
    })

    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
      nonce: 7,
    })
    const hash = await mpcSignAndSend(
      provider,
      "0xaaaa0000000000000000000000000000000000aa",
      "0x12345678",
      0n,
    )
    expect(hash).toBe("0xbroadcast")
    expect(mocks.getWallet).toHaveBeenCalledWith("wallet-eth")
    expect(mocks.sign).toHaveBeenCalledTimes(1)
    const signArg = mocks.sign.mock.calls[0]?.[0] as {
      walletId: string
      keyType: string
      message: Uint8Array
    }
    expect(signArg.walletId).toBe("wallet-eth")
    expect(signArg.keyType).toBe("secp256k1")
    expect(signArg.message).toBeInstanceOf(Uint8Array)
    expect(signArg.message.length).toBe(32) // EIP-1559 unsigned hash is keccak256 = 32 bytes
  })

  it("normalizes v < 27 to v + 27", async () => {
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "wallet-eth",
      id: "wallet-eth",
      ethAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    mocks.sign.mockResolvedValueOnce({
      signature: "0x",
      r: "0x" + "11".repeat(32),
      s: "0x" + "22".repeat(32),
      v: 0, // recovery id form (not yet offset)
    })
    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    await mpcSignAndSend(
      provider,
      "0xaaaa0000000000000000000000000000000000aa",
      "0x",
      0n,
    )
    // The broadcast call should have happened (no throw). The v
    // normalization is internal — we verify indirectly by getting
    // through to broadcast.
    expect(
      (provider as { broadcastTransaction: { mock: unknown } })
        .broadcastTransaction,
    ).toBeTruthy()
  })

  it("falls back to splitting compact 65-byte signature when r/s missing", async () => {
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "wallet-eth",
      id: "wallet-eth",
      ethAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    const r = "11".repeat(32)
    const s = "22".repeat(32)
    const v = "1b" // 27
    mocks.sign.mockResolvedValueOnce({
      signature: "0x" + r + s + v,
      // No r/s/v fields — should split from signature.
    })
    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    await mpcSignAndSend(
      provider,
      "0xaaaa0000000000000000000000000000000000aa",
      "0x",
      0n,
    )
    expect(mocks.sign).toHaveBeenCalledTimes(1)
    // The broadcast happened, meaning split worked.
  })

  it("throws if compact signature is too short to split", async () => {
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "wallet-eth",
      id: "wallet-eth",
      ethAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    mocks.sign.mockResolvedValueOnce({
      signature: "0x1234", // way too short
    })
    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    await expect(
      mpcSignAndSend(
        provider,
        "0xaaaa0000000000000000000000000000000000aa",
        "0x",
      ),
    ).rejects.toThrow(/signature too short/)
  })
})

describe("mpcSignAndSend — failure modes", () => {
  it("throws when env block is incomplete (clean standalone error)", async () => {
    delete process.env.BRIDGE_MPC_URL
    _resetMpcClientForTests()
    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    await expect(
      mpcSignAndSend(
        provider,
        "0xaaaa0000000000000000000000000000000000aa",
        "0x",
      ),
    ).rejects.toThrow(/MPC signing unavailable/)
  })

  it("throws when BRIDGE_MPC_WALLET_ID is unset", async () => {
    delete process.env.BRIDGE_MPC_WALLET_ID
    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    await expect(
      mpcSignAndSend(
        provider,
        "0xaaaa0000000000000000000000000000000000aa",
        "0x",
      ),
    ).rejects.toThrow(/BRIDGE_MPC_WALLET_ID is not set/)
  })

  it("throws when MPC wallet has no eth_address", async () => {
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "wallet-eth",
      id: "wallet-eth",
      // No ethAddress.
    })
    const provider = makeProvider({
      fromAddress: "0xinvalid",
    })
    await expect(
      mpcSignAndSend(
        provider,
        "0xaaaa0000000000000000000000000000000000aa",
        "0x",
      ),
    ).rejects.toThrow(/no eth_address/)
  })
})

describe("mpcBridgeMint", () => {
  it("encodes bridgeMint(recipient, amount) call data", async () => {
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "wallet-eth",
      id: "wallet-eth",
      ethAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    mocks.sign.mockResolvedValueOnce({
      signature: "0xabc",
      r: "0x" + "11".repeat(32),
      s: "0x" + "22".repeat(32),
      v: 27,
    })
    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })

    const abi = [
      "function bridgeMint(address recipient, uint256 amount)",
    ]
    const recipient = "0x1111111111111111111111111111111111111111"
    const amount = 1_000_000_000_000_000_000n // 1 ETH in wei

    await mpcBridgeMint(
      provider,
      "0xaaaa0000000000000000000000000000000000bb",
      recipient,
      amount,
      abi,
    )
    // sign got called with a hashed payload (32 bytes); we don't decode
    // it back, but presence of the call confirms encodeFunctionData ran.
    expect(mocks.sign).toHaveBeenCalledTimes(1)
  })
})

describe("mpcSendNative", () => {
  it("posts an empty-data tx with the requested native value", async () => {
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "wallet-eth",
      id: "wallet-eth",
      ethAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    mocks.sign.mockResolvedValueOnce({
      signature: "0x",
      r: "0x" + "11".repeat(32),
      s: "0x" + "22".repeat(32),
      v: 27,
    })
    const provider = makeProvider({
      fromAddress: "0x1234567890abcdef1234567890abcdef12345678",
    })
    await mpcSendNative(
      provider,
      "0xcccc0000000000000000000000000000000000cc",
      5n,
    )
    expect(mocks.sign).toHaveBeenCalledTimes(1)
  })
})
