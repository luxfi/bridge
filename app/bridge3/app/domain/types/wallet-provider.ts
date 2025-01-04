import type { Wallet } from '@/domain/types'

interface WalletProvider {
  connectWallet: (chain?: string | number | undefined | null) => Promise<void> | undefined | void
  disconnectWallet: () => Promise<void> | undefined | void
  getConnectedWallet: () => Wallet | undefined
  autofillSupportedNetworks?: string[]
  withdrawalSupportedNetworks: string[]
  name: string
}

export { type WalletProvider as default }