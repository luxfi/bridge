// Importing JSON files for mainnet
import mainnetCurrencies from './mainnet/currencies.json'
import mainnetDiscovery from './mainnet/discovery.json'
import mainnetExchanges from './mainnet/exchanges.json'
import mainnetNetworks from './mainnet/networks.json'

// Importing JSON files for testnet
import testnetCurrencies from './testnet/currencies.json'
import testnetDiscovery from './testnet/discovery.json'
import testnetExchanges from './testnet/exchanges.json'
import testnetNetworks from './testnet/networks.json'

export const mainnetSettings = {
  data: {
    currencies: mainnetCurrencies,
    discovery: mainnetDiscovery,
    exchanges: mainnetExchanges,
    networks: mainnetNetworks
  },
  error: null
}

export const testnetSettings = {
  data: {
    currencies: testnetCurrencies,
    discovery: testnetDiscovery,
    exchanges: testnetExchanges,
    networks: testnetNetworks
  },
  error: null
}
