// Importing JSON files for mainnet
import mainnetNetworks from "./mainnet/networks.json"
// Importing JSON files for testnet
import testnetExchanges from "./testnet/exchanges.json"
import testnetNetworks from "./testnet/networks.json"
// testnets
import mainnetExchanges from "./mainnet/exchanges.json"

export const mainnetSettings = {
  data: {
    currencies: [],
    exchanges: mainnetExchanges,
    networks: [...mainnetNetworks, ...testnetNetworks]
  },
  sources: [],
  destinations: [],
  error: null
}

export const testnetSettings = {
  data: {
    exchanges: testnetExchanges,
    networks: testnetNetworks
  },
  error: null
}
