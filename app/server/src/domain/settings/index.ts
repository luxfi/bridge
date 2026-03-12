import mainnetNetworks from './mainnet/networks'
import mainnetExchanges from './mainnet/exchanges'
import testnetExchanges from './testnet/exchanges'
import testnetNetworks from './testnet/networks'
import devnetExchanges from './devnet/exchanges'
import devnetNetworks from './devnet/networks'
import swapPairs from './swap-pairs'

export const mainnetSettings = {
  data: {
    currencies: [],
    discovery: {},
    exchanges: mainnetExchanges,
    networks: mainnetNetworks,
    swapPairs
  },
  sources: [],
  destinations: [],
  contractAddress: {},
  error: null,
}

export const testnetSettings = {
  data: {
    currencies: [],
    discovery: {},
    exchanges: testnetExchanges,
    networks: testnetNetworks,
    swapPairs
  },
  sources: [],
  destinations: [],
  contractAddress: {},
  error: null,
}

export const devnetSettings = {
  data: {
    currencies: [],
    discovery: {},
    exchanges: devnetExchanges,
    networks: devnetNetworks,
    swapPairs
  },
  sources: [],
  destinations: [],
  contractAddress: {},
  error: null,
}

export type NetworkVersion = 'mainnet' | 'testnet' | 'devnet'

export const getSettings = (version: NetworkVersion) => {
  switch (version) {
    case 'devnet': return devnetSettings
    case 'testnet': return testnetSettings
    default: return mainnetSettings
  }
}
