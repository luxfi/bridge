// Lux KMS HTTP client tests.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { KMSError, KMSSecretClient } from "../kms"
import { IAMClient } from "../iam"

const ISSUER = "https://iam.lux.network"
const KMS_URL = "https://kms.lux.cloud"

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

beforeEach(() => {})
afterEach(() => {
  vi.restoreAllMocks()
})

function newClient() {
  const iam = new IAMClient({
    issuer: ISSUER,
    clientId: "lux-bridge",
    clientSecret: "test-secret",
  })
  return new KMSSecretClient({ url: KMS_URL, org: "lux", iam })
}

describe("KMSSecretClient.getSecret", () => {
  it("GETs /v1/kms/orgs/{org}/secrets/{path} with Bearer token", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // 1st call: IAM mint
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "iam-tok", expires_in: 3600 }),
      )
      // 2nd call: KMS get (text body)
      .mockResolvedValueOnce(textResponse("-----BEGIN PRIVATE KEY-----\nABC\n-----END"))

    const c = newClient()
    const secret = await c.getSecret("bridge/cosigners/utila/org-a/sa_pem")
    expect(secret).toBe("-----BEGIN PRIVATE KEY-----\nABC\n-----END")

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [url, init] = fetchSpy.mock.calls[1]!
    expect(url).toBe(
      `${KMS_URL}/v1/kms/orgs/lux/secrets/bridge/cosigners/utila/org-a/sa_pem`,
    )
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer iam-tok",
    })
  })

  it("unwraps JSON envelope { value: ... } when Content-Type is JSON", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: "secret-bytes" }))
    const c = newClient()
    expect(await c.getSecret("p/q")).toBe("secret-bytes")
  })

  it("unwraps { secret: ... } variant too", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ secret: "alt-value" }))
    const c = newClient()
    expect(await c.getSecret("p")).toBe("alt-value")
  })

  it("throws KMSError (404) when secret missing", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
    const c = newClient()
    await expect(c.getSecret("nope")).rejects.toMatchObject({
      name: "KMSError",
      httpStatus: 404,
    })
  })

  it("throws KMSError (401) and invalidates IAM cache", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok-2", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(textResponse("recovered"))
    const c = newClient()
    await expect(c.getSecret("p")).rejects.toMatchObject({
      name: "KMSError",
      httpStatus: 401,
    })
    // Next call refetches the token (because invalidate fired).
    expect(await c.getSecret("p")).toBe("recovered")
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it("throws KMSError for other non-2xx", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "tok", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
    const c = newClient()
    await expect(c.getSecret("p")).rejects.toMatchObject({
      name: "KMSError",
      httpStatus: 503,
    })
  })
})
