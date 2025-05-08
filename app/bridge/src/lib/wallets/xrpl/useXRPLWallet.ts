import { useXrplWallet } from '@/hooks/useXrplWallet'
import type { WalletProvider } from '@/hooks/useWallet'
import type { Wallet } from '@/stores/walletStore'
import XrplIcon from '@/components/icons/Wallets/XRPL'

export default function useXRPLWallet(): WalletProvider {
  const { account, connector, connectXumm, connectLedger, disconnect } = useXrplWallet()

  const getConnectedWallet = (): Wallet | undefined => {
    if (!account) return undefined
    return {
      address: account.address,
      providerName: 'XRPL',
      icon: XrplIcon,
      connector,
      chainId: undefined
    }
  }

  return {
    name: 'XRPL',
    autofillSupportedNetworks: ['XRP_MAINNET', 'XRP_TESTNET'],
    withdrawalSupportedNetworks: [],
    connectWallet: async (_chain?: string | number | null | undefined) => {
      await connectXumm()
    },
    disconnectWallet: () => disconnect(),
    getConnectedWallet
  }
}