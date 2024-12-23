import { mainnetSettings,  testnetSettings } from './settings'

export const getExchanges = (version: 'mainnet' | 'testnet') => {
  const settings = (version === "mainnet") ? mainnetSettings : testnetSettings
  return settings.data.exchanges
}
