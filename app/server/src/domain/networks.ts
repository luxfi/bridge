import { mainnetSettings,  testnetSettings } from './settings'

export const getNetworks = (version: 'mainnet' | 'testnet') => {
  const settings = (version === "mainnet") ? mainnetSettings : testnetSettings
  return settings.data.networks
}
