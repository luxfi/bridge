import { toast } from '@hanzo/ui/primitives-common'
import { useEvm } from './evm/useEvm'
// import useTON from '../lib/wallets/ton/useTON'
// import useStarknet from '../lib/wallets/starknet/useStarknet'
// import useImmutableX from '../lib/wallets/immutableX/useIMX'
// import useSolana from '../lib/wallets/solana/useSolana'
//types
import type { SwapItem } from '@/domain/types/swap'
import type { Wallet } from '@/domain/types/wallet'
import type { Network } from '@luxfi/core'

export type WalletProvider = {
  connectWallet: (chain?: string | number | undefined | null) => Promise<void> | undefined | void
  disconnectWallet: () => Promise<void> | undefined | void
  getConnectedWallet: () => Wallet | undefined
  autofillSupportedNetworks?: string[]
  withdrawalSupportedNetworks: string[]
  name: string
}

function useWallet() {
  const WalletProviders: WalletProvider[] = [
    useEvm(),
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

  const handleDisconnect = async (providerName: string, swap?: SwapItem) => {
    const provider = WalletProviders.find((provider) => provider.name === providerName)
    try {
      // if (swap?.source_exchange) {
      //   const apiClient = new BridgeApiClient()
      //   await apiClient.DisconnectExchangeAsync(swap.id, 'coinbase')
      // } else {
      //   await provider?.disconnectWallet()
      // }
      await provider?.disconnectWallet()
    } catch {
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

export default useWallet
