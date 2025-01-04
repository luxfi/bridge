import { toast } from '@hanzo/ui/primitives-common'

import type { Network } from '@luxfi/core'
import type { SwapItem, Wallet, WalletProvider } from '@/domain/types'

import { useEvmProvider } from './providers'

interface useWalletsReturn {
  wallets: Wallet[]
  connectWallet: (providerName: string, chain?: string | number) => Promise<void>
  disconnectWallet: (providerName: string, swap?: SwapItem) => Promise<void>
  getWithdrawalProvider: (network: Network) => WalletProvider | undefined
  getAutofillProvider: (network: Network) => WalletProvider | undefined
  getAutofillProviderUsingName: (network: string) => WalletProvider | undefined
}

const useWallets = (): useWalletsReturn => {

  const WalletProviders: WalletProvider[] = [
    useEvmProvider(),
    // useTON(),
    // useStarknet(),
    // useImmutableX(),
    // useSolana(),
  ]

  async function handleConnect(providerName: string, chain?: string | number) {
    const provider = WalletProviders.find((provider) => provider.name === providerName)
    try {
      await provider?.connectWallet(chain)
    } catch {
      toast.error('Could not connect the account')
    }
  }

  const handleDisconnect = async (providerName: string, swap?: SwapItem): Promise<void> => {
    const provider = WalletProviders.find((provider) => provider.name === providerName)
    try {
      // if (swap?.source_exchange) {
      //   const apiClient = new BridgeApiClient()
      //   await apiClient.DisconnectExchangeAsync(swap.id, 'coinbase')
      // } else {
      //   await provider?.disconnectWallet()
      // }
      await provider?.disconnectWallet()
    } 
    catch {
      toast.error('Could not disconnect the account')
    }
  }

  const getConnectedWallets = () => {
    let connectedWallets: Wallet[] = []

    WalletProviders.forEach((wallet) => {
      const w = wallet.getConnectedWallet()
      connectedWallets = (w && [...connectedWallets, w]) || [...connectedWallets]
    })

    return connectedWallets
  }

  const getWithdrawalProvider = (network: Network) => {
    const provider = WalletProviders.find((provider) => provider.withdrawalSupportedNetworks.includes(network.internal_name))
    return provider
  }

  const getAutofillProvider = (network: Network) => {
    console.log(WalletProviders)
    const provider = WalletProviders.find((provider) => provider?.autofillSupportedNetworks?.includes(network.internal_name))
    return provider
  }

  const getAutofillProviderUsingName = (network: string) => {
    console.log(WalletProviders)
    const provider = WalletProviders.find((provider) => provider?.autofillSupportedNetworks?.includes(network))
    return provider
  }

  return {
    wallets: getConnectedWallets(),
    connectWallet: handleConnect,
    disconnectWallet: handleDisconnect,
    getWithdrawalProvider,
    getAutofillProvider,
    getAutofillProviderUsingName,
  }
}

export default useWallets
