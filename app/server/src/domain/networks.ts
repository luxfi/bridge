import { mainnetSettings, testnetSettings, devnetSettings, type NetworkVersion } from './settings'

export const getNetworks = (version: NetworkVersion) => {
  switch (version) {
    case 'devnet': return devnetSettings.data.networks
    case 'testnet': return testnetSettings.data.networks
    default: return mainnetSettings.data.networks
  }
}
