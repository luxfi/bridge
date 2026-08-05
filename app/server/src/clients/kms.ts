// Lux KMS HTTP client — native bridge backend secret round-trip.
//
// Replaces every env-var fallback in cosigners.fetchCosignerSecret and
// every plaintext credential read in `domain/utila.ts`. Mirrors the
// shape of github.com/luxfi/kms/pkg/* Go clients but speaks the same
// HTTP surface so a TS bridge backend and Go services interoperate
// against one canonical KMS.
//
// HTTP surface (from ~/work/lux/kms/cmd/kms/main.go):
//   POST /v1/kms/auth/login                              — exchange OIDC JWT for KMS session JWT
//   GET  /v1/kms/orgs/{org}/secrets/{path...}            — fetch a secret
//   POST /v1/kms/orgs/{org}/secrets                      — create a secret (admin)
//   DELETE /v1/kms/orgs/{org}/secrets/{path...}          — delete a secret (admin)
//
// Auth: Bearer JWT with `aud` claim matching the bridge's tenant id
// (e.g. `acme-bd`, `lux-bridge`). Token is minted by Lux IAM via
// `IAMClient.mint('kms')` and cached for its TTL.
//
// All secrets returned are STRINGS (PEM, JSON, bytes — caller decides
// how to parse). KMS itself stores them as opaque bytes; the path
// namespacing reflects the consumer (e.g. `bridge/cosigners/utila/{org}/sa_pem`).

import { IAMClient } from "./iam"

// Call-time lookup so vi.spyOn(globalThis, 'fetch') intercepts in tests.
const _fetch = (...args: Parameters<typeof globalThis.fetch>) =>
  globalThis.fetch(...args)

export interface KMSConfig {
  /** Lux KMS endpoint, e.g. `https://kms.lux.cloud`. */
  url: string
  /** Org slug whose secret namespace we're reading from. */
  org: string
  /** IAM token minter (shared across KMS / MPC clients). */
  iam: IAMClient
  /** Audience the IAM client mints for. Default `kms`. */
  audience?: string
}

export class KMSError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly path?: string,
  ) {
    super(message)
    this.name = "KMSError"
  }
}

export class KMSSecretClient {
  private readonly baseUrl: string
  private readonly audience: string

  constructor(private readonly cfg: KMSConfig) {
    if (!cfg.url) throw new Error("kms: url required")
    if (!cfg.org) throw new Error("kms: org required")
    if (!cfg.iam) throw new Error("kms: iam client required")
    this.baseUrl = cfg.url.replace(/\/$/, "")
    this.audience = cfg.audience ?? "kms"
  }

  /**
   * Read a secret at the given path under the configured org. Throws
   * KMSError on transport / auth / 4xx / 5xx; returns the raw string
   * body on 200.
   */
  async getSecret(path: string): Promise<string> {
    const cleanPath = path.replace(/^\/+/, "")
    const url = `${this.baseUrl}/v1/kms/orgs/${encodeURIComponent(this.cfg.org)}/secrets/${cleanPath}`
    const token = await this.cfg.iam.mint(this.audience)
    let resp: Response
    try {
      resp = await _fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (err) {
      throw new KMSError(
        `kms: GET ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        cleanPath,
      )
    }
    if (resp.status === 401) {
      // Invalidate the cached token so the next call refetches.
      this.cfg.iam.invalidate(this.audience)
      throw new KMSError(
        "kms: 401 unauthorized — IAM token may have expired or aud mismatch",
        401,
        cleanPath,
      )
    }
    if (resp.status === 404) {
      throw new KMSError(
        `kms: secret not found at ${cleanPath}`,
        404,
        cleanPath,
      )
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "")
      throw new KMSError(
        `kms: GET returned ${resp.status}: ${text.slice(0, 300)}`,
        resp.status,
        cleanPath,
      )
    }
    // KMS may return either a raw string body or a JSON envelope
    // `{ "value": "..." }`. Inspect the Content-Type to pick.
    const ct = resp.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      const json = (await resp.json()) as { value?: string; secret?: string }
      const value = json.value ?? json.secret
      if (typeof value !== "string") {
        throw new KMSError(
          `kms: JSON response missing 'value' / 'secret' field for ${cleanPath}`,
          200,
          cleanPath,
        )
      }
      return value
    }
    return await resp.text()
  }
}
