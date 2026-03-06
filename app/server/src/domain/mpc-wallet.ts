import logger from "@/logger"

/**
 * Native MPC wallet integration for Lux Bridge.
 * Replaces Utila/Fireblocks — uses our own MPC API to create wallets
 * and derives addresses for all supported chains from a single keygen.
 */

// Network type to address field mapping
const NETWORK_ADDRESS_TYPE: Record<string, 'eth' | 'btc' | 'sol' | 'ton' | 'xrp'> = {
  // EVM chains use eth address
  ETHEREUM_MAINNET: 'eth',
  ETHEREUM_SEPOLIA: 'eth',
  ETHEREUM_GOERLI: 'eth',
  BASE_MAINNET: 'eth',
  BASE_SEPOLIA: 'eth',
  HOLESKY_TESTNET: 'eth',
  LUX_MAINNET: 'eth',
  LUX_TESTNET: 'eth',
  ZOO_MAINNET: 'eth',
  ZOO_TESTNET: 'eth',
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
  // Cardano (placeholder — needs Ed25519)
  CARDANO_MAINNET: 'sol',
}

interface MPCKeygenResult {
  wallet_id: string
  ecdsa_pub_key: string
  eddsa_pub_key: string
  eth_address: string
  btc_address: string
  sol_address: string
  result_type?: string
  error?: string
}

interface MPCWalletResult {
  walletId: string
  address: string
  ethAddress: string
  btcAddress: string
  solAddress: string
  ecdsaPubKey: string
  eddsaPubKey: string
}

function getMpcApiUrl(): string {
  // Use internal K8s service URL or env override
  return process.env.MPC_API_URL || 'http://mpc-node-0.mpc-node-headless.lux-mpc.svc:9800'
}

function getMpcDashboardUrl(): string {
  return process.env.MPC_DASHBOARD_URL || 'http://mpc-api-svc.lux-mpc.svc:8081'
}

/**
 * Create a new MPC wallet for a bridge deposit.
 * Triggers keygen on our MPC cluster and returns the appropriate address
 * for the given network.
 */
export async function createMPCWalletForDeposit(networkInternalName: string): Promise<{
  name: string
  addresses: { address: string }[]
}> {
  const mpcUrl = getMpcApiUrl()
  const walletId = `bridge-${networkInternalName.toLowerCase()}-${Date.now()}`

  logger.info(`Creating MPC wallet for deposit on ${networkInternalName}`, { walletId, mpcUrl })

  try {
    const resp = await fetch(`${mpcUrl}/keygen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_id: walletId }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      throw new Error(`MPC keygen failed (${resp.status}): ${errBody}`)
    }

    const result: MPCKeygenResult = await resp.json()

    if (result.result_type && result.result_type !== 'success') {
      throw new Error(`MPC keygen error: ${result.error || 'unknown'}`)
    }

    // Pick the right address for this network
    const addrType = NETWORK_ADDRESS_TYPE[networkInternalName] || 'eth'
    let address: string
    switch (addrType) {
      case 'btc':
        address = result.btc_address
        break
      case 'sol':
      case 'ton':
        address = result.sol_address
        break
      case 'xrp':
        // XRP uses secp256k1 but with different address derivation
        // For now, use the ETH address as an identifier;
        // proper rAddress derivation should be added
        address = result.eth_address
        break
      default:
        address = result.eth_address
    }

    if (!address) {
      throw new Error(`No ${addrType} address returned from MPC keygen`)
    }

    logger.info(`MPC wallet created for ${networkInternalName}`, {
      walletId: result.wallet_id,
      address,
      addrType,
    })

    // Return in Utila-compatible format: name###address
    return {
      name: result.wallet_id,
      addresses: [{ address }],
    }
  } catch (error) {
    logger.error(`Failed to create MPC wallet for ${networkInternalName}`, { error })
    throw error
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
  LUX_MAINNET: 'https://api.lux.network/ext/bc/C/rpc',
  LUX_TESTNET: 'https://api.lux-test.network/ext/bc/C/rpc',
  ZOO_MAINNET: 'https://api.zoo.network/ext/bc/Z/rpc',
  ZOO_TESTNET: 'https://api.zoo-test.network/ext/bc/Z/rpc',
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
}
