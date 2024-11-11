// Importing JSON files for mainnet
import mainnetDiscovery from './mainnet/discovery.json'
import mainnetNetworks from './mainnet/networks.json'
import mainnetDepositContractAddress from './testnet/deposit.json'
// Importing JSON files for testnet
import testnetCurrencies from './testnet/currencies.json'
import testnetDiscovery from './testnet/discovery.json'
import testnetExchanges from './testnet/exchanges.json'
import testnetNetworks from './testnet/networks.json'
import testnetSources from './testnet/sources.json'
import testnetDestinations from './testnet/destinations.json'
import testnetDepositContractAddress from './testnet/deposit.json'
// testnets
import mainnetCurrencies from './mainnet/currencies.json'
import mainnetExchanges from './mainnet/exchanges.json'
import mainnetSources from './mainnet/sources.json'
import mainnetDestinations from './mainnet/destinations.json'

export const mainnetSettings = {
  data: {
    currencies: [],
    discovery: mainnetDiscovery,
    exchanges: [],
    networks: [...mainnetNetworks, ...testnetNetworks],
  },
  sources: [],
  destinations: [],
  contractAddress: mainnetDepositContractAddress,
  error: null,
  // data: {
  //   currencies: mainnetCurrencies,
  //   discovery: mainnetDiscovery,
  //   exchanges: mainnetExchanges,
  //   networks: mainnetNetworks,
  // },
  // sources: mainnetSources,
  // destinations: mainnetDestinations,
  // contractAddress: mainnetDepositContractAddress,
  // error: null,
}

export const testnetSettings = {
  data: {
    currencies: testnetCurrencies,
    discovery: testnetDiscovery,
    exchanges: testnetExchanges,
    networks: testnetNetworks,
  },
  sources: testnetSources,
  destinations: testnetDestinations,
  contractAddress: testnetDepositContractAddress,
  error: null,
}
