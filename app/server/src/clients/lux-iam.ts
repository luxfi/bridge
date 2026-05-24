// Lux IAM OAuth2 client_credentials minter.
//
// Mirrors github.com/luxfi/kms/pkg/iamclient — short-lived bearer tokens
// scoped to an audience, cached per-audience with early refresh.
//
// Lux IAM (~/work/lux/iam, Casdoor-derived) exposes a standard OAuth2
// token endpoint. Bridge backend mints tokens for:
//   - audience=lux-kms      → for the Lux KMS client below
//   - audience=lux-mpc      → for the Lux MPC daemon (mpcd)
//
// The minted JWT carries owner=<org>, sub=<service account>, roles=[…]
// claims that downstream services use for authorization.

// Node 18+ has fetch globally. Look up at call time (not module load)
// so vi.spyOn(globalThis, 'fetch') in tests intercepts cleanly.
const _fetch = (...args: Parameters<typeof globalThis.fetch>) =>
  globalThis.fetch(...args)

export interface IAMConfig {
  /** Lux IAM issuer URL, e.g. `https://iam.lux.network`. */
  issuer: string
  /** OAuth2 client_id provisioned for the bridge service. */
  clientId: string
  /** OAuth2 client_secret. Resolved at startup from KMS or env (NEVER hardcoded). */
  clientSecret: string
  /** Override the default `/oauth/token` path. */
  tokenPath?: string
  /** Refresh this much before expiry (seconds). Default 60. */
  earlyRefreshSec?: number
}

interface CachedToken {
  token: string
  /** Epoch ms when this token expires (with earlyRefresh applied). */
  expiresAt: number
}

export class IAMTokenError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly body?: string,
  ) {
    super(message)
    this.name = "IAMTokenError"
  }
}

export class LuxIAMClient {
  private readonly cache = new Map<string, CachedToken>()
  private readonly tokenUrl: string
  private readonly earlyRefreshMs: number

  constructor(private readonly cfg: IAMConfig) {
    if (!cfg.issuer) throw new Error("lux-iam: issuer required")
    if (!cfg.clientId) throw new Error("lux-iam: clientId required")
    if (!cfg.clientSecret) throw new Error("lux-iam: clientSecret required")
    const path = cfg.tokenPath ?? "/oauth/token"
    this.tokenUrl = cfg.issuer.replace(/\/$/, "") + path
    this.earlyRefreshMs = (cfg.earlyRefreshSec ?? 60) * 1000
  }

  /** Mint or reuse a cached bearer token for the given audience. */
  async mint(audience: string): Promise<string> {
    const cached = this.cache.get(audience)
    const now = Date.now()
    if (cached && cached.expiresAt > now) return cached.token

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      audience,
    })
    let resp: Response
    try {
      resp = await _fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
    } catch (err) {
      throw new IAMTokenError(
        `lux-iam: token POST to ${this.tokenUrl} failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "")
      throw new IAMTokenError(
        `lux-iam: token endpoint returned ${resp.status}`,
        resp.status,
        text.slice(0, 500),
      )
    }
    const json = (await resp.json()) as {
      access_token?: string
      expires_in?: number
    }
    if (!json.access_token) {
      throw new IAMTokenError("lux-iam: response missing access_token")
    }
    const ttlMs = (json.expires_in ?? 3600) * 1000
    this.cache.set(audience, {
      token: json.access_token,
      expiresAt: now + ttlMs - this.earlyRefreshMs,
    })
    return json.access_token
  }

  /** Drop a cached token. The next mint() refetches. */
  invalidate(audience: string): void {
    this.cache.delete(audience)
  }
}
