// Importing JSON files for mainnet
import mainnetNetworks from './mainnet/networks.json'
import mainnetExchanges from './mainnet/exchanges.json'
// Importing JSON files for testnet
import testnetExchanges from './testnet/exchanges.json'
import testnetNetworks from './testnet/networks.json'

export const mainnetSettings = {
  data: {
    currencies: [],
    discovery: {},
    exchanges: mainnetExchanges,
    networks: [...mainnetNetworks, ...testnetNetworks],
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
