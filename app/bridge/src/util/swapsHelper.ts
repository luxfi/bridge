import { SWAP_PAIRS } from '@/components/lux/teleport/constants/settings'
import { NetworkType, type CryptoNetwork, type NetworkCurrency } from '@/Models/CryptoNetwork'

/**
 * get destination networks from source asset
 * @param asset
 * @returns
 */
  // BUG?: :aa This only works for teleport but is called by utila!!
export const getDestinationNetworks = (asset: NetworkCurrency | undefined, networks: CryptoNetwork[]) => {
  if (!asset) {
    return []
  } else {
    return networks
      .map((n: CryptoNetwork) => ({
        ...n,
        currencies: n.currencies.filter((c: NetworkCurrency) => SWAP_PAIRS?.[asset.asset]?.includes(c.asset)),
      }))
      .filter((n: CryptoNetwork) => n.currencies.length > 0 && n.type === NetworkType.EVM)
  }
}
/**
 *
 * @param asset
 * @param swapPairs
 * @returns
 */
export const getAvailableSourcePairs = (asset: NetworkCurrency | undefined) => {
  if (asset) {
    return Object.entries(SWAP_PAIRS).reduce((assets: string[], [key, value]) => {
      if (value.includes(asset.asset)) {
        return [...assets, key]
      } else {
        return [...assets]
      }
    }, [])
  } else {
    return []
  }
}
/**
 * 
 * @param asset 
 * @param networks 
 * @returns 
 */
export const getSourceNetworks = (asset: NetworkCurrency | undefined, networks: CryptoNetwork[]) => {
  const swapPairs = getAvailableSourcePairs(asset)
  if (!asset) {
    return {
      sourceNetworks: [],
      swapPairs,
    }
  } else {
    const _networks = networks.filter((n: CryptoNetwork) => n.currencies.some((c: NetworkCurrency) => swapPairs.includes(c.asset)))
    return {
      sourceNetworks: _networks,
      swapPairs,
    }
  }
}
/**
 * 
 * @param network 
 * @param asset 
 * @param networks 
 * @returns 
 */
export const getFirstSourceNetwork = (network: CryptoNetwork | undefined, asset: NetworkCurrency | undefined, networks: CryptoNetwork[]) => {
  const swapPairs = getAvailableSourcePairs(asset)
  if (!asset || !network) {
    return {
      srcNetwork: undefined,
      srcAsset: undefined,
    }
  } else {
    const _network = networks
      .filter((n: CryptoNetwork) => n.internal_name !== network.internal_name)
      .find((n: CryptoNetwork) => n.currencies.some((c: NetworkCurrency) => swapPairs.includes(c.asset)))
    return {
      srcNetwork: _network,
      srcAsset: _network?.currencies.find((c: NetworkCurrency) => swapPairs.includes(c.asset)),
    }
  }
}
