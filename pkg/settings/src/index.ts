// Importing JSON files for mainnet
import mainnetNetworks from "./mainnet/networks.json"
import mainnetExchanges from "./mainnet/exchanges.json"
// Importing JSON files for testnet
import testnetNetworks from "./testnet/networks.json"
import testnetExchanges from "./testnet/exchanges.json"

export const mainnetSettings = {
  data: {
    currencies: [],
    exchanges: mainnetExchanges,
    networks: [...mainnetNetworks, ...testnetNetworks]
  },
  error: null
}

export const testnetSettings = {
  data: {
    exchanges: testnetExchanges,
    networks: testnetNetworks
  },
  error: null
}
