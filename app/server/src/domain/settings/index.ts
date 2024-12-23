import mainnetNetworks from './mainnet/networks'
import mainnetExchanges from './mainnet/exchanges'
import testnetExchanges from './testnet/exchanges'
import testnetNetworks from './testnet/networks'

export const mainnetSettings = {
  data: {
    currencies: [],
    discovery: {},
    exchanges: mainnetExchanges,
    networks: mainnetNetworks,
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
  },
  sources: [],
  destinations: [],
  contractAddress: {},
  error: null,
}

export const getSettings = (version: 'mainnet' | 'testnet') => (
  (version === "mainnet") ? mainnetSettings : testnetSettings
)
