import logger from "@/logger"
import { IAMClient } from "@/clients/iam"
import { MPCClient } from "@/clients/mpc"
import { CardanoNetwork, encodeCardanoAddress } from "./cardano-address.js"
import { encodeXRPAddress } from "./xrp-address.js"
import { encodeSubstrateAddress, SUBSTRATE_NETWORKS } from "./substrate-address.js"
import { checkSubstrateDeposit } from "./substrate-deposit.js"

/**
 * Native MPC wallet integration for the bridge.
 *
 * createMPCWalletForDeposit goes through the canonical MPCClient
 * (~/work/lux/mpc daemon HTTP API) so per-bridge MPC code is fully
 * eliminated. Deposit checking continues to hit per-chain blockchain
 * RPCs directly (no MPC-side dependency).
 *
 * Env (brand-neutral):
 *   BRIDGE_MPC_URL              required for keygen
 *   BRIDGE_IAM_ISSUER + IAM_CLIENT_ID + IAM_CLIENT_SECRET   required (auth)
 *   BRIDGE_MPC_VAULT_ID         vault to create wallets under (default "bridge")
 */

let _mpcClient: MPCClient | undefined
function getMpcClient(): MPCClient | undefined {
  if (_mpcClient) return _mpcClient
  const url = process.env.BRIDGE_MPC_URL
  const issuer = process.env.BRIDGE_IAM_ISSUER
  const clientId = process.env.BRIDGE_IAM_CLIENT_ID
  const clientSecret = process.env.BRIDGE_IAM_CLIENT_SECRET
  if (!url || !issuer || !clientId || !clientSecret) return undefined
  const iam = new IAMClient({ issuer, clientId, clientSecret })
  _mpcClient = new MPCClient({ url, iam })
  return _mpcClient
}

export function _resetMpcWalletClientForTests(): void {
  _mpcClient = undefined
}

// Network type to address field mapping
const NETWORK_ADDRESS_TYPE: Record<string, 'eth' | 'btc' | 'sol' | 'ton' | 'xrp' | 'dot' | 'ada'> = {
  // EVM chains use eth address
  ETHEREUM_MAINNET: 'eth',
  ETHEREUM_SEPOLIA: 'eth',
  ETHEREUM_GOERLI: 'eth',
  BASE_MAINNET: 'eth',
  BASE_SEPOLIA: 'eth',
  HOLESKY_TESTNET: 'eth',
  LUX_MAINNET: 'eth',
  LUX_TESTNET: 'eth',
  LUX_DEVNET: 'eth',
  ZOO_MAINNET: 'eth',
  ZOO_TESTNET: 'eth',
  ZOO_DEVNET: 'eth',
  BSC_MAINNET: 'eth',
  BSC_TESTNET: 'eth',
  POLYGON_MAINNET: 'eth',
  ARBITRUM_MAINNET: 'eth',
  OPTIMISM_MAINNET: 'eth',
  AVAX_MAINNET: 'eth',
  FANTOM_MAINNET: 'eth',
  CELO_MAINNET: 'eth',
  GNOSIS_MAINNET: 'eth',
  AURORA_MAINNET: 'eth',
  ZORA_MAINNET: 'eth',
  BLAST_MAINNET: 'eth',
  LINEA_MAINNET: 'eth',
  // Bitcoin
  BITCOIN_MAINNET: 'btc',
  BITCOIN_TESTNET: 'btc',
  // Solana
  SOLANA_MAINNET: 'sol',
  SOLANA_DEVNET: 'sol',
  SOLANA_TESTNET: 'sol',
  // TON
  TON_MAINNET: 'ton',
  TON_TESTNET: 'ton',
  // XRP
  XRP_MAINNET: 'xrp',
  XRP_TESTNET: 'xrp',
  // Polkadot / Substrate
  POLKADOT_MAINNET: 'dot',
  // Cardano. Same curve and same FROST signing as Solana — the key is not
  // the problem. The ADDRESS is: Cardano is bech32 addr1... over
  // blake2b-224, Solana is the base58 public key. Mapped to 'sol' this
  // issued Solana-shaped deposit addresses for ADA.
  CARDANO_MAINNET: 'ada',
}

// The MPCClient.keygen / getWallet response shapes are defined in
// clients/mpc.ts. This module just consumes them; no per-bridge type
// duplication.

/**
 * Create a new MPC wallet for a bridge deposit via the canonical
 * MPCClient. Returns the network-appropriate address in the
 * legacy Utila-compatible `{ name, addresses: [{ address }] }` shape
 * so existing call-sites in domain/swaps.ts stay unchanged.
 *
 * Picks the chain-family-appropriate address from the keygen result:
 *   eth    → ECDSA derived (EVM, XRPL secp256k1)
 *   btc    → secp256k1 derived (P2WPKH default)
 *   sol/ton → ed25519 derived
 *   dot    → SS58-encoded ed25519 public key
 *   ada    → CIP-19 bech32 over blake2b-224 of the ed25519 public key
 *   xrp    → classic r-address: base58check, XRPL alphabet, over
 *            RIPEMD160(SHA256(pubkey))
 */
export async function createMPCWalletForDeposit(
  networkInternalName: string,
): Promise<{
  name: string
  addresses: { address: string }[]
}> {
  const client = getMpcClient()
  if (!client) {
    throw new Error(
      "MPC wallet keygen unavailable: BRIDGE_MPC_URL / BRIDGE_IAM_* env block is incomplete",
    )
  }
  const vaultId = process.env.BRIDGE_MPC_VAULT_ID || "bridge"
  const walletName = `bridge-${networkInternalName.toLowerCase()}-${Date.now()}`
  const addrType = NETWORK_ADDRESS_TYPE[networkInternalName] || "eth"

  // Pick the right keygen protocol/curve for the destination chain.
  // m-chain supports CGGMP21 (secp256k1) and FROST (ed25519); the bridge
  // picks per-chain-family at keygen time. Each wallet record holds the
  // protocol; the bridge does NOT mix curves on one wallet.
  const protocol = addrType === "sol" || addrType === "ton" || addrType === "dot"
    ? "frost"
    : "cggmp21"
  const keyType = addrType === "sol" || addrType === "ton" || addrType === "dot"
    ? "ed25519"
    : "secp256k1"

  logger.info(
    `[mpc-wallet] keygen for ${networkInternalName} (vault=${vaultId}, name=${walletName}, protocol=${protocol})`,
  )

  const result = await client.keygen({
    vaultId,
    name: walletName,
    keyType,
    protocol,
  })

  // Fetch the wallet to resolve the per-chain-family address. keygen
  // returns the protocol-level wallet record; getWallet returns the
  // chain-family derived addresses.
  const wallet = await client.getWallet(result.walletId)

  let address: string | undefined
  switch (addrType) {
    case "btc":
      address = wallet.btcAddress
      break
    case "ada": {
      // Same key as Solana — Ed25519, signed by FROST, which
      // luxfi/threshold supports natively. Only the address differs:
      // Solana's IS the public key, Cardano's is blake2b-224 of it inside a
      // typed, network-tagged bech32 envelope. Mapped to "sol" this handed
      // out a Solana-shaped string to send ADA to.
      const pubKeyHex = wallet.eddsaPubKey
      if (!pubKeyHex) {
        throw new Error(
          "MPC keygen did not return an eddsa public key for the Cardano address",
        )
      }
      address = encodeCardanoAddress(
        new Uint8Array(
          Buffer.from(
            pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex,
            "hex",
          ),
        ),
        CardanoNetwork.Mainnet,
      )
      break
    }
    case "sol":
    case "ton":
      address = wallet.solAddress
      break
    case "xrp": {
      // Derived here rather than waiting on mpcd to return an rAddress. It
      // fell through to wallet.ethAddress, so anyone bridging to XRP was
      // handed an 0x string to send XRP to — the Cardano bug in a different
      // family.
      //
      // XRPL takes the compressed secp256k1 key, which is what ecdsaPubKey
      // already is. The Ed25519 path exists in the encoder for completeness;
      // the bridge's XRP custody is secp256k1.
      const pubKeyHex = wallet.ecdsaPubKey
      if (!pubKeyHex) {
        throw new Error(
          "MPC keygen did not return an ecdsa public key for the XRP address",
        )
      }
      address = encodeXRPAddress(
        new Uint8Array(
          Buffer.from(
            pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex,
            "hex",
          ),
        ),
      )
      break
    }
    case "dot": {
      // SS58-encode the ed25519 public key.
      const pubKeyHex = wallet.eddsaPubKey
      if (!pubKeyHex) {
        throw new Error(
          "MPC keygen did not return eddsa public key for Substrate address derivation",
        )
      }
      const pubKeyBytes = new Uint8Array(
        Buffer.from(
          pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex,
          "hex",
        ),
      )
      address = encodeSubstrateAddress(pubKeyBytes, SUBSTRATE_NETWORKS.POLKADOT)
      break
    }
    default:
      address = wallet.ethAddress
  }

  if (!address) {
    throw new Error(
      `MPC keygen returned no ${addrType} address for ${networkInternalName} (wallet=${result.walletId})`,
    )
  }

  logger.info(
    `[mpc-wallet] created wallet=${result.walletId} address=${address} on ${networkInternalName}`,
  )

  return {
    name: result.walletId,
    addresses: [{ address }],
  }
}

/**
 * Check if a deposit has been received at the given address on the given network.
 * Queries blockchain RPCs directly instead of Utila balance API.
 */
export async function checkNativeDeposit({
  networkInternalName,
  address,
  asset,
  requiredAmount,
}: {
  networkInternalName: string
  address: string
  asset: string
  requiredAmount: number
}): Promise<boolean> {
  const addrType = NETWORK_ADDRESS_TYPE[networkInternalName] || 'eth'

  try {
    switch (addrType) {
      case 'eth':
        return await checkEVMDeposit(networkInternalName, address, asset, requiredAmount)
      case 'btc':
        return await checkBTCDeposit(networkInternalName, address, requiredAmount)
      case 'sol':
        return await checkSOLDeposit(networkInternalName, address, asset, requiredAmount)
      case 'ton':
        return await checkTONDeposit(networkInternalName, address, requiredAmount)
      case 'dot':
        return await checkSubstrateDeposit(networkInternalName, address, requiredAmount)
      default:
        logger.warn(`Deposit check not implemented for ${addrType}`)
        return false
    }
  } catch (error) {
    logger.error(`Deposit check failed for ${networkInternalName}/${address}`, { error })
    return false
  }
}

// RPC endpoints per network
const RPC_URLS: Record<string, string> = {
  ETHEREUM_MAINNET: 'https://eth.llamarpc.com',
  ETHEREUM_SEPOLIA: 'https://rpc.sepolia.org',
  BASE_MAINNET: 'https://mainnet.base.org',
  BASE_SEPOLIA: 'https://sepolia.base.org',
  LUX_MAINNET: 'https://api.lux.network/v1/bc/C/rpc',
  LUX_TESTNET: 'https://api.lux-test.network/v1/bc/C/rpc',
  ZOO_MAINNET: 'https://api.zoo.network/v1/bc/C/rpc',
  ZOO_TESTNET: 'https://api.zoo-test.network/v1/bc/C/rpc',
  BSC_MAINNET: 'https://bsc-dataseed.binance.org',
  BSC_TESTNET: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  POLYGON_MAINNET: 'https://polygon-rpc.com',
  ARBITRUM_MAINNET: 'https://arb1.arbitrum.io/rpc',
  OPTIMISM_MAINNET: 'https://mainnet.optimism.io',
  AVAX_MAINNET: 'https://api.avax.network/ext/bc/C/rpc',
  HOLESKY_TESTNET: 'https://ethereum-holesky-rpc.publicnode.com',
  // Bitcoin
  BITCOIN_MAINNET: 'https://blockstream.info/api',
  BITCOIN_TESTNET: 'https://blockstream.info/testnet/api',
  // Solana
  SOLANA_MAINNET: 'https://api.mainnet-beta.solana.com',
  SOLANA_DEVNET: 'https://api.devnet.solana.com',
  // TON
  TON_MAINNET: 'https://toncenter.com/api/v2',
  TON_TESTNET: 'https://testnet.toncenter.com/api/v2',
  // Polkadot / Substrate
  POLKADOT_MAINNET: 'https://rpc.polkadot.io',
}

async function checkEVMDeposit(network: string, address: string, asset: string, requiredAmount: number): Promise<boolean> {
  const rpc = RPC_URLS[network]
  if (!rpc) return false

  // For native tokens (ETH, LUX, BNB, etc.)
  const resp = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: 1,
    }),
  })
  const data = await resp.json() as any
  const balanceWei = BigInt(data.result || '0x0')
  const balanceEth = Number(balanceWei) / 1e18
  return balanceEth >= requiredAmount
}

async function checkBTCDeposit(network: string, address: string, requiredAmount: number): Promise<boolean> {
  const apiBase = RPC_URLS[network]
  if (!apiBase) return false

  const resp = await fetch(`${apiBase}/address/${address}`)
  if (!resp.ok) return false
  const data = await resp.json() as any
  // Blockstream API returns funded_txo_sum and spent_txo_sum in sats
  const balanceSats = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0)
  const balanceBtc = balanceSats / 1e8
  return balanceBtc >= requiredAmount
}

async function checkSOLDeposit(network: string, address: string, asset: string, requiredAmount: number): Promise<boolean> {
  const rpc = RPC_URLS[network]
  if (!rpc) return false

  const resp = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }),
  })
  const data = await resp.json() as any
  const balanceLamports = data.result?.value || 0
  const balanceSol = balanceLamports / 1e9
  return balanceSol >= requiredAmount
}

async function checkTONDeposit(network: string, address: string, requiredAmount: number): Promise<boolean> {
  const apiBase = RPC_URLS[network]
  if (!apiBase) return false

  const resp = await fetch(`${apiBase}/getAddressBalance?address=${address}`)
  if (!resp.ok) return false
  const data = await resp.json() as any
  const balanceNano = Number(data.result || 0)
  const balanceTon = balanceNano / 1e9
  return balanceTon >= requiredAmount
}

/**
 * Archive/cleanup a wallet. No-op for native MPC — wallets persist.
 */
export async function archiveMPCWallet(walletId: string): Promise<void> {
  logger.info(`Wallet archival requested for ${walletId} (no-op for native MPC)`)
}

// Re-export the network-to-asset mapping for use in deposit detection
export const NETWORK_ASSET_MAP: Record<string, Record<string, string>> = {
  BITCOIN_MAINNET: { BTC: 'BTC' },
  BITCOIN_TESTNET: { BTC: 'BTC' },
  ETHEREUM_MAINNET: { ETH: 'ETH', USDT: 'USDT', USDC: 'USDC', WETH: 'WETH', DAI: 'DAI' },
  ETHEREUM_SEPOLIA: { ETH: 'ETH', USDT: 'USDT', USDC: 'USDC', WETH: 'WETH', DAI: 'DAI' },
  BASE_MAINNET: { ETH: 'ETH', USDC: 'USDC' },
  BASE_SEPOLIA: { ETH: 'ETH', USDC: 'USDC' },
  LUX_MAINNET: { LUX: 'LUX' },
  LUX_TESTNET: { LUX: 'LUX' },
  ZOO_MAINNET: { ZOO: 'ZOO' },
  ZOO_TESTNET: { ZOO: 'ZOO' },
  SOLANA_MAINNET: { SOL: 'SOL', USDC: 'USDC', BONK: 'BONK', WIF: 'WIF' },
  SOLANA_DEVNET: { SOL: 'SOL' },
  TON_MAINNET: { TON: 'TON', NOT: 'NOT', DOGS: 'DOGS' },
  TON_TESTNET: { TON: 'TON' },
  BSC_MAINNET: { BNB: 'BNB' },
  BSC_TESTNET: { BNB: 'BNB' },
  XRP_MAINNET: { XRP: 'XRP' },
  XRP_TESTNET: { XRP: 'XRP' },
  POLKADOT_MAINNET: { DOT: 'DOT' },
}
