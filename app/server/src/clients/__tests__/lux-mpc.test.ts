// Lux MPC daemon (mpcd) HTTP client tests.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LuxMPCClient, MPCError } from "../lux-mpc"
import { LuxIAMClient } from "../lux-iam"

const ISSUER = "https://iam.lux.network"
const MPC_URL = "https://mpc.lux.network"

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function newClient(timeoutMs?: number) {
  const iam = new LuxIAMClient({
    issuer: ISSUER,
    clientId: "lux-bridge",
    clientSecret: "test-secret",
  })
  return new LuxMPCClient({ url: MPC_URL, iam, ...(timeoutMs ? { timeoutMs } : {}) })
}

beforeEach(() => {})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("LuxMPCClient.keygen", () => {
  it("POSTs /v1/vaults/{vaultID}/wallets with key_type + protocol", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "wallet-1",
          walletId: "wallet-1",
          vaultId: "v",
          name: "bridge-key",
          public_key: "04abc...",
          address: "0xabc",
          status: "ready",
        }),
      )

    const c = newClient()
    const result = await c.keygen({
      vaultId: "v",
      name: "bridge-key",
      keyType: "secp256k1",
      protocol: "cggmp21",
    })
    expect(result).toMatchObject({
      id: "wallet-1",
      walletId: "wallet-1",
      vaultId: "v",
      keyType: "secp256k1",
      protocol: "cggmp21",
      publicKey: "04abc...",
      address: "0xabc",
    })

    const [url, init] = fetchSpy.mock.calls[1]!
    expect(url).toBe(`${MPC_URL}/v1/vaults/v/wallets`)
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      name: "bridge-key",
      key_type: "secp256k1",
      protocol: "cggmp21",
    })
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer tok",
    })
  })
})

describe("LuxMPCClient.sign", () => {
  it("POSTs /v1/transactions with type=sign and base64 payload", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          signature: "deadbeef",
          r: "feed",
          s: "face",
          v: 27,
        }),
      )

    const c = newClient()
    const msg = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const result = await c.sign({
      walletId: "wallet-1",
      keyType: "secp256k1",
      message: msg,
    })
    expect(result).toEqual({ signature: "deadbeef", r: "feed", s: "face", v: 27 })

    const body = JSON.parse(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit).body as string,
    )
    expect(body).toMatchObject({
      type: "sign",
      wallet_id: "wallet-1",
      key_type: "secp256k1",
      payload: Buffer.from(msg).toString("base64"),
    })
  })

  it("throws MPCError when response missing signature field", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
    const c = newClient()
    await expect(
      c.sign({
        walletId: "w",
        keyType: "secp256k1",
        message: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/missing signature/)
  })

  it("invalidates IAM token on 401 (recovers on next call)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok-1", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok-2", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ signature: "ok" }))
    const c = newClient()
    await expect(
      c.sign({
        walletId: "w",
        keyType: "secp256k1",
        message: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ httpStatus: 401 })
    const ok = await c.sign({
      walletId: "w",
      keyType: "secp256k1",
      message: new Uint8Array([1]),
    })
    expect(ok.signature).toBe("ok")
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it("aborts on timeout and throws MPCError", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            ;(init as { signal?: AbortSignal }).signal?.addEventListener(
              "abort",
              () =>
                reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            )
          }),
      )
    const c = newClient(50) // 50ms timeout
    await expect(
      c.sign({
        walletId: "w",
        keyType: "secp256k1",
        message: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ name: "MPCError" })
  }, 1000)
})

describe("LuxMPCClient.status", () => {
  it("returns { online, total, protocols } parsed from /v1/status", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          online: 3,
          total: 3,
          protocols: ["cggmp21", "frost", "bls"],
          threshold: 2,
        }),
      )
    const c = newClient()
    const s = await c.status()
    expect(s.online).toBe(3)
    expect(s.total).toBe(3)
    expect(s.protocols).toContain("cggmp21")
    expect(s.threshold).toBe(2)
  })
})

describe("LuxMPCClient construction", () => {
  it("rejects construction without required fields", () => {
    expect(() =>
      new LuxMPCClient({ url: "", iam: {} as never }),
    ).toThrow(/url/)
    const iamOk = new LuxIAMClient({
      issuer: ISSUER,
      clientId: "id",
      clientSecret: "s",
    })
    expect(() =>
      new LuxMPCClient({ url: MPC_URL, iam: undefined as unknown as LuxIAMClient }),
    ).toThrow(/iam/)
    expect(new LuxMPCClient({ url: MPC_URL, iam: iamOk })).toBeInstanceOf(
      LuxMPCClient,
    )
  })
})

// Defensive — MPCError export shape
describe("MPCError", () => {
  it("carries httpStatus and endpoint", () => {
    const e = new MPCError("boom", 500, "/v1/transactions")
    expect(e.name).toBe("MPCError")
    expect(e.httpStatus).toBe(500)
    expect(e.endpoint).toBe("/v1/transactions")
  })
})
