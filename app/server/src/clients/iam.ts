// IAM OAuth2 client_credentials minter — brand-neutral.
//
// Mirrors the canonical Go client (github.com/luxfi/kms/pkg/iamclient)
// in TypeScript: short-lived bearer tokens scoped to an audience,
// cached per-audience with early refresh. The bridge backend mints:
//   - audience=kms  for the KMSClient (secrets)
//   - audience=mpc  for the MPCClient (threshold signer)
//
// The IAM service itself is jurisdiction-neutral. Tenants configure
// the issuer via BRIDGE_IAM_ISSUER at startup — could be
// `iam.lux.network`, `iam.zoo.network`, a self-hosted Casdoor, or any
// OIDC issuer that speaks client_credentials.

// Node 18+ has fetch globally. Look up at call time (not module load)
// so vi.spyOn(globalThis, 'fetch') in tests intercepts cleanly.
const _fetch = (...args: Parameters<typeof globalThis.fetch>) =>
  globalThis.fetch(...args)

export interface IAMConfig {
  /** OIDC issuer URL, e.g. `https://iam.lux.network` or any provider. */
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

export class IAMClient {
  private readonly cache = new Map<string, CachedToken>()
  private readonly tokenUrl: string
  private readonly earlyRefreshMs: number

  constructor(private readonly cfg: IAMConfig) {
    if (!cfg.issuer) throw new Error("iam: issuer required")
    if (!cfg.clientId) throw new Error("iam: clientId required")
    if (!cfg.clientSecret) throw new Error("iam: clientSecret required")
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
        `iam: token POST to ${this.tokenUrl} failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "")
      throw new IAMTokenError(
        `iam: token endpoint returned ${resp.status}`,
        resp.status,
        text.slice(0, 500),
      )
    }
    const json = (await resp.json()) as {
      access_token?: string
      expires_in?: number
    }
    if (!json.access_token) {
      throw new IAMTokenError("iam: response missing access_token")
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
