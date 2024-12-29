import mainnetNetworks from './mainnet/networks'
import mainnetExchanges from './mainnet/exchanges'
import testnetExchanges from './testnet/exchanges'
import testnetNetworks from './testnet/networks'
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

export const getSettings = (version: 'mainnet' | 'testnet') => (
  (version === "mainnet") ? mainnetSettings : testnetSettings
)
