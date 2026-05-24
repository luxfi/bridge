// mpc-wallet tests — verifies createMPCWalletForDeposit routes through
// the canonical MPCClient (keygen + getWallet).
//
// Mocks @/clients/mpc.MPCClient. Asserts:
//   - EVM chains pick cggmp21 + secp256k1 + ethAddress
//   - SOL / TON / Polkadot pick frost + ed25519 + (sol|substrate) address
//   - BTC picks cggmp21 + secp256k1 + btcAddress
//   - XRP falls back to ethAddress (rAddress derivation TODO)
//   - Substrate (DOT) derives SS58 from eddsa_pub_key
//   - Returns Utila-compatible { name, addresses: [{ address }] } shape

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  keygen: vi.fn(),
  getWallet: vi.fn(),
}))

vi.mock("@/clients/mpc", () => ({
  MPCClient: vi.fn().mockImplementation(() => ({
    keygen: mocks.keygen,
    getWallet: mocks.getWallet,
  })),
}))

vi.mock("@/clients/iam", () => ({
  IAMClient: vi.fn(),
}))

import {
  _resetMpcWalletClientForTests,
  createMPCWalletForDeposit,
} from "../mpc-wallet"

beforeEach(() => {
  _resetMpcWalletClientForTests()
  mocks.keygen.mockReset()
  mocks.getWallet.mockReset()
  process.env.BRIDGE_MPC_URL = "https://mpc.example.test"
  process.env.BRIDGE_IAM_ISSUER = "https://iam.example.test"
  process.env.BRIDGE_IAM_CLIENT_ID = "bridge"
  process.env.BRIDGE_IAM_CLIENT_SECRET = "sec"
})
afterEach(() => {
  delete process.env.BRIDGE_MPC_URL
  delete process.env.BRIDGE_IAM_ISSUER
  delete process.env.BRIDGE_IAM_CLIENT_ID
  delete process.env.BRIDGE_IAM_CLIENT_SECRET
  delete process.env.BRIDGE_MPC_VAULT_ID
  // Don't vi.restoreAllMocks — the MPCClient constructor mock is set
  // in vi.mock factory once at module load; restoring would null it.
})

describe("createMPCWalletForDeposit — EVM chains", () => {
  it("ETHEREUM_MAINNET → cggmp21 + secp256k1 + ethAddress", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-1",
      walletId: "w-1",
      vaultId: "bridge",
      keyType: "secp256k1",
      protocol: "cggmp21",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-1",
      id: "w-1",
      ethAddress: "0xabc1234567890abcdef1234567890abcdef12345",
      ecdsaPubKey: "0x04...",
    })
    const out = await createMPCWalletForDeposit("ETHEREUM_MAINNET")
    expect(out.name).toBe("w-1")
    expect(out.addresses[0]?.address).toBe(
      "0xabc1234567890abcdef1234567890abcdef12345",
    )
    const kgArg = mocks.keygen.mock.calls[0]?.[0] as {
      protocol: string
      keyType: string
      vaultId: string
    }
    expect(kgArg.protocol).toBe("cggmp21")
    expect(kgArg.keyType).toBe("secp256k1")
    expect(kgArg.vaultId).toBe("bridge") // default
  })

  it("BASE_MAINNET + custom vault → still cggmp21 + ethAddress", async () => {
    process.env.BRIDGE_MPC_VAULT_ID = "custom-vault"
    _resetMpcWalletClientForTests()
    mocks.keygen.mockResolvedValueOnce({
      id: "w-base",
      walletId: "w-base",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-base",
      id: "w-base",
      ethAddress: "0xbase00000000000000000000000000000000beef",
    })
    const out = await createMPCWalletForDeposit("BASE_MAINNET")
    expect(out.addresses[0]?.address).toBe(
      "0xbase00000000000000000000000000000000beef",
    )
    expect(mocks.keygen.mock.calls[0]?.[0].vaultId).toBe("custom-vault")
  })
})

describe("createMPCWalletForDeposit — BTC", () => {
  it("BITCOIN_MAINNET → cggmp21 + btcAddress", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-btc",
      walletId: "w-btc",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-btc",
      id: "w-btc",
      btcAddress: "bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    })
    const out = await createMPCWalletForDeposit("BITCOIN_MAINNET")
    expect(out.addresses[0]?.address).toBe(
      "bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    )
    expect(mocks.keygen.mock.calls[0]?.[0].protocol).toBe("cggmp21")
    expect(mocks.keygen.mock.calls[0]?.[0].keyType).toBe("secp256k1")
  })
})

describe("createMPCWalletForDeposit — ed25519 chains", () => {
  it("SOLANA_MAINNET → frost + ed25519 + solAddress", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-sol",
      walletId: "w-sol",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-sol",
      id: "w-sol",
      solAddress: "SolPubKey11111111111111111111111111111111",
    })
    const out = await createMPCWalletForDeposit("SOLANA_MAINNET")
    expect(out.addresses[0]?.address).toBe(
      "SolPubKey11111111111111111111111111111111",
    )
    expect(mocks.keygen.mock.calls[0]?.[0].protocol).toBe("frost")
    expect(mocks.keygen.mock.calls[0]?.[0].keyType).toBe("ed25519")
  })

  it("TON_MAINNET → frost + ed25519 + uses solAddress field", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-ton",
      walletId: "w-ton",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-ton",
      id: "w-ton",
      solAddress: "ton-ed25519-pubkey-derived-address",
    })
    const out = await createMPCWalletForDeposit("TON_MAINNET")
    expect(out.addresses[0]?.address).toBe("ton-ed25519-pubkey-derived-address")
  })
})

describe("createMPCWalletForDeposit — XRP (secp256k1 with eth fallback)", () => {
  it("XRP_MAINNET → cggmp21 + ethAddress fallback (rAddress derivation TODO)", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-xrp",
      walletId: "w-xrp",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-xrp",
      id: "w-xrp",
      ethAddress: "0xxrpfallback00000000000000000000000000aaaa",
    })
    const out = await createMPCWalletForDeposit("XRP_MAINNET")
    expect(out.addresses[0]?.address).toBe(
      "0xxrpfallback00000000000000000000000000aaaa",
    )
    expect(mocks.keygen.mock.calls[0]?.[0].protocol).toBe("cggmp21")
  })
})

describe("createMPCWalletForDeposit — Substrate (DOT)", () => {
  it("POLKADOT_MAINNET → SS58 from eddsaPubKey", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-dot",
      walletId: "w-dot",
    })
    // 32-byte ed25519 public key (all zeros for determinism)
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-dot",
      id: "w-dot",
      eddsaPubKey:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    })
    const out = await createMPCWalletForDeposit("POLKADOT_MAINNET")
    // SS58 encoded Polkadot address starts with '1' (network prefix 0).
    expect(out.addresses[0]?.address).toMatch(/^1[A-HJ-NP-Za-km-z1-9]+$/)
    expect(mocks.keygen.mock.calls[0]?.[0].protocol).toBe("frost")
  })

  it("Substrate throws when eddsa pubkey missing", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-dot",
      walletId: "w-dot",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-dot",
      id: "w-dot",
      // No eddsaPubKey.
    })
    await expect(
      createMPCWalletForDeposit("POLKADOT_MAINNET"),
    ).rejects.toThrow(/eddsa public key/)
  })
})

describe("createMPCWalletForDeposit — failure modes", () => {
  it("throws cleanly when env block is incomplete", async () => {
    delete process.env.BRIDGE_MPC_URL
    _resetMpcWalletClientForTests()
    await expect(createMPCWalletForDeposit("ETHEREUM_MAINNET")).rejects.toThrow(
      /env block is incomplete/,
    )
  })

  it("throws when getWallet returns no chain-family address", async () => {
    mocks.keygen.mockResolvedValueOnce({
      id: "w-bad",
      walletId: "w-bad",
    })
    mocks.getWallet.mockResolvedValueOnce({
      walletId: "w-bad",
      id: "w-bad",
      // No ethAddress, no btcAddress, etc.
    })
    await expect(createMPCWalletForDeposit("ETHEREUM_MAINNET")).rejects.toThrow(
      /no eth address/,
    )
  })
})
