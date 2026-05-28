// Lux IAM token-minting client.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IAMTokenError, IAMClient } from "../iam"

const ISSUER = "https://iam.lux.network"
const TOKEN_URL = `${ISSUER}/oauth/token`

const cfg = {
  issuer: ISSUER,
  clientId: "lux-bridge",
  clientSecret: "test-secret",
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("IAMClient.mint", () => {
  it("posts client_credentials form to /oauth/token and returns access_token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ access_token: "tok-1", expires_in: 3600 }),
    )

    const c = new IAMClient(cfg)
    const token = await c.mint("kms")
    expect(token).toBe("tok-1")

    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe(TOKEN_URL)
    expect((init as RequestInit).method).toBe("POST")
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    })
    const body = (init as RequestInit).body as string
    const params = new URLSearchParams(body)
    expect(params.get("grant_type")).toBe("client_credentials")
    expect(params.get("client_id")).toBe("lux-bridge")
    expect(params.get("client_secret")).toBe("test-secret")
    expect(params.get("audience")).toBe("kms")
  })

  it("caches the token until close to expiry, refreshes after", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ access_token: "tok-1", expires_in: 120 }))

    const c = new IAMClient(cfg)
    expect(await c.mint("a")).toBe("tok-1")
    expect(await c.mint("a")).toBe("tok-1") // cache hit
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Advance past the cached TTL (expires_in=120s, earlyRefresh=60s → cache TTL = 60s).
    vi.setSystemTime(new Date("2026-01-01T00:01:30Z"))
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ access_token: "tok-2", expires_in: 120 }),
    )
    expect(await c.mint("a")).toBe("tok-2")
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("caches per-audience independently", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "for-kms", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "for-mpc", expires_in: 3600 }),
      )

    const c = new IAMClient(cfg)
    expect(await c.mint("kms")).toBe("for-kms")
    expect(await c.mint("mpc")).toBe("for-mpc")
    expect(await c.mint("kms")).toBe("for-kms") // cached
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("invalidate(audience) forces a refetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok-1", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok-2", expires_in: 3600 }),
      )

    const c = new IAMClient(cfg)
    expect(await c.mint("a")).toBe("tok-1")
    c.invalidate("a")
    expect(await c.mint("a")).toBe("tok-2")
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("throws IAMTokenError on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("invalid_client", { status: 401 }),
    )
    await expect(new IAMClient(cfg).mint("a")).rejects.toMatchObject({
      name: "IAMTokenError",
      httpStatus: 401,
    })
  })

  it("throws IAMTokenError when access_token missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ expires_in: 3600 }),
    )
    await expect(new IAMClient(cfg).mint("a")).rejects.toThrow(
      /missing access_token/,
    )
  })

  it("rejects construction without required fields", () => {
    expect(() => new IAMClient({ ...cfg, clientId: "" })).toThrow(/clientId/)
    expect(() => new IAMClient({ ...cfg, clientSecret: "" })).toThrow(
      /clientSecret/,
    )
    expect(() => new IAMClient({ ...cfg, issuer: "" })).toThrow(/issuer/)
  })
})
