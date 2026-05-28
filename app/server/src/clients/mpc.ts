// Lux MPC daemon (mpcd) HTTP client — native m-chain threshold signer.
//
// Mirrors github.com/luxfi/kms/pkg/mpc/client.go in TypeScript. This is
// THE canonical entry point into Lux m-chain (public MPC, threshold-t
// signing cluster) for the bridge backend. No per-bridge MPC code lives
// in the bridge; everything threshold-related routes through mpcd.
//
// HTTP surface (from ~/work/lux/mpc/cmd/mpcd/main.go +
// ~/work/lux/kms/pkg/mpc/client.go):
//   POST /v1/vaults/{vaultID}/wallets    — distributed keygen (DKG); returns wallet+pubkey
//   POST /v1/transactions               — threshold sign a payload
//   POST /v1/wallets/{id}/reshare       — change threshold / participant set
//   GET  /v1/wallets/{id}               — wallet metadata
//   GET  /v1/status                     — cluster status (online peers, share counts)
//
// Auth: Bearer JWT with `aud=mpc`. The bridge mints via the same
// IAMClient used by KMSSecretClient. Sign calls are RATE LIMITED at the
// daemon and have a per-call default timeout of 120s (matches mpcd's
// threshold-completion ceiling).
//
// Protocol selection (CGGMP21 / FROST / BLS / SR25519 / Pulsar /
// Corona / Magnetar / Doerner) is per-wallet at keygen time. Sign calls
// don't re-specify — the wallet record holds the protocol identifier.

import { IAMClient } from "./iam"

// Call-time lookup so vi.spyOn(globalThis, 'fetch') intercepts in tests.
const _fetch = (...args: Parameters<typeof globalThis.fetch>) =>
  globalThis.fetch(...args)

export type MpcProtocol =
  | "cggmp21"
  | "frost"
  | "bls"
  | "sr25519"
  | "doerner"
  | "pulsar"
  | "corona"
  | "magnetar"

export type MpcKeyType =
  | "secp256k1"
  | "ed25519"
  | "bls"
  | "sr25519"

export interface MPCConfig {
  /** mpcd base URL, e.g. `https://mpc.lux.network`. */
  url: string
  iam: IAMClient
  /** Audience for IAM token. Default `mpc`. */
  audience?: string
  /** Per-call timeout (ms). Default 120000 (matches mpcd's ceiling). */
  timeoutMs?: number
}

export interface KeygenRequest {
  vaultId: string
  name: string
  keyType: MpcKeyType
  protocol: MpcProtocol
}

export interface KeygenResult {
  id: string
  walletId: string
  vaultId: string
  name?: string
  keyType: MpcKeyType
  protocol: MpcProtocol
  publicKey?: string
  address?: string
  status?: string
}

export interface SignRequest {
  walletId: string
  keyType: MpcKeyType
  /** Bytes to sign — caller decides hashing convention. */
  message: Uint8Array
}

export interface SignResult {
  /** Raw signature bytes (provider-specific encoding) hex-encoded. */
  signature: string
  /** Optional split r/s for ECDSA. */
  r?: string
  s?: string
  v?: number
}

export interface ClusterStatus {
  online: number
  total: number
  protocols: MpcProtocol[]
  threshold?: number
}

/** Wallet metadata returned by GET /v1/wallets/{id}. */
export interface WalletInfo {
  id: string
  walletId: string
  vaultId?: string
  keyType?: MpcKeyType
  protocol?: MpcProtocol
  /** Per-chain-family derived addresses. */
  ethAddress?: string
  btcAddress?: string
  solAddress?: string
  /** Per-curve public keys. */
  ecdsaPubKey?: string
  eddsaPubKey?: string
  status?: string
}

export class MPCError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly endpoint?: string,
  ) {
    super(message)
    this.name = "MPCError"
  }
}

export class MPCClient {
  private readonly baseUrl: string
  private readonly audience: string
  private readonly timeoutMs: number

  constructor(private readonly cfg: MPCConfig) {
    if (!cfg.url) throw new Error("mpc: url required")
    if (!cfg.iam) throw new Error("mpc: iam client required")
    this.baseUrl = cfg.url.replace(/\/$/, "")
    this.audience = cfg.audience ?? "mpc"
    this.timeoutMs = cfg.timeoutMs ?? 120_000
  }

  async keygen(req: KeygenRequest): Promise<KeygenResult> {
    const url = `${this.baseUrl}/v1/vaults/${encodeURIComponent(req.vaultId)}/wallets`
    const body = JSON.stringify({
      name: req.name,
      key_type: req.keyType,
      protocol: req.protocol,
    })
    const json = await this.do<Record<string, unknown>>("POST", url, body)
    return {
      id: String(json.id ?? json.wallet_id ?? ""),
      walletId: String(json.walletId ?? json.wallet_id ?? json.id ?? ""),
      vaultId: String(json.vaultId ?? json.vault_id ?? req.vaultId),
      name: typeof json.name === "string" ? json.name : undefined,
      keyType: req.keyType,
      protocol: req.protocol,
      publicKey:
        typeof json.public_key === "string"
          ? json.public_key
          : typeof json.publicKey === "string"
          ? json.publicKey
          : undefined,
      address:
        typeof json.address === "string" ? json.address : undefined,
      status: typeof json.status === "string" ? json.status : undefined,
    }
  }

  async sign(req: SignRequest): Promise<SignResult> {
    const url = `${this.baseUrl}/v1/transactions`
    const body = JSON.stringify({
      type: "sign",
      wallet_id: req.walletId,
      key_type: req.keyType,
      // mpcd accepts base64 for byte payloads in transactions.
      payload: Buffer.from(req.message).toString("base64"),
    })
    const json = await this.do<Record<string, unknown>>("POST", url, body)
    const sig =
      typeof json.signature === "string"
        ? json.signature
        : typeof json.sig === "string"
        ? json.sig
        : ""
    if (!sig) {
      throw new MPCError(
        "mpc: sign response missing signature field",
        200,
        "/v1/transactions",
      )
    }
    const result: SignResult = { signature: sig }
    if (typeof json.r === "string") result.r = json.r
    if (typeof json.s === "string") result.s = json.s
    if (typeof json.v === "number") result.v = json.v
    return result
  }

  async status(): Promise<ClusterStatus> {
    const json = await this.do<Record<string, unknown>>(
      "GET",
      `${this.baseUrl}/v1/status`,
    )
    return {
      online: Number(json.online ?? 0),
      total: Number(json.total ?? 0),
      protocols: Array.isArray(json.protocols)
        ? (json.protocols as MpcProtocol[])
        : [],
      threshold:
        typeof json.threshold === "number" ? json.threshold : undefined,
    }
  }

  /**
   * Look up wallet metadata — derived addresses (per chain family),
   * public keys, protocol, status. Bridge uses this to resolve the
   * settlement wallet's EVM address before building an unsigned tx.
   */
  async getWallet(walletId: string): Promise<WalletInfo> {
    const url = `${this.baseUrl}/v1/wallets/${encodeURIComponent(walletId)}`
    const json = await this.do<Record<string, unknown>>("GET", url)
    const result: WalletInfo = {
      id: String(json.id ?? json.wallet_id ?? walletId),
      walletId: String(
        json.walletId ?? json.wallet_id ?? json.id ?? walletId,
      ),
    }
    if (typeof json.vaultId === "string") result.vaultId = json.vaultId
    else if (typeof json.vault_id === "string") result.vaultId = json.vault_id
    if (typeof json.keyType === "string")
      result.keyType = json.keyType as MpcKeyType
    else if (typeof json.key_type === "string")
      result.keyType = json.key_type as MpcKeyType
    if (typeof json.protocol === "string")
      result.protocol = json.protocol as MpcProtocol
    if (typeof json.ethAddress === "string") result.ethAddress = json.ethAddress
    else if (typeof json.eth_address === "string")
      result.ethAddress = json.eth_address
    if (typeof json.btcAddress === "string") result.btcAddress = json.btcAddress
    else if (typeof json.btc_address === "string")
      result.btcAddress = json.btc_address
    if (typeof json.solAddress === "string") result.solAddress = json.solAddress
    else if (typeof json.sol_address === "string")
      result.solAddress = json.sol_address
    if (typeof json.ecdsaPubKey === "string")
      result.ecdsaPubKey = json.ecdsaPubKey
    else if (typeof json.ecdsa_pub_key === "string")
      result.ecdsaPubKey = json.ecdsa_pub_key
    if (typeof json.eddsaPubKey === "string")
      result.eddsaPubKey = json.eddsaPubKey
    else if (typeof json.eddsa_pub_key === "string")
      result.eddsaPubKey = json.eddsa_pub_key
    if (typeof json.status === "string") result.status = json.status
    return result
  }

  private async do<T>(
    method: string,
    url: string,
    body?: string,
  ): Promise<T> {
    const token = await this.cfg.iam.mint(this.audience)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let resp: Response
    try {
      resp = await _fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal,
      })
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError"
      throw new MPCError(
        isAbort
          ? `mpc: ${method} ${url} aborted after ${this.timeoutMs}ms`
          : `mpc: ${method} ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        url,
      )
    } finally {
      clearTimeout(timer)
    }
    if (resp.status === 401) {
      this.cfg.iam.invalidate(this.audience)
      throw new MPCError(
        "mpc: 401 unauthorized — IAM token expired or aud mismatch",
        401,
        url,
      )
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "")
      throw new MPCError(
        `mpc: ${method} returned ${resp.status}: ${text.slice(0, 300)}`,
        resp.status,
        url,
      )
    }
    return (await resp.json()) as T
  }
}
