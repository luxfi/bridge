import KnownInternalNames from '../known-ids'
import { useDisconnect } from 'wagmi'
import { useAccount } from 'wagmi'
import { useSettings } from '@/contexts/settings'
import { ResolveEVMWalletIcon } from '../resolve-evm-icon'
import { useLux } from '@/contexts/luxkit'
// types
import type { WalletProvider } from '../useWallet'
/**
 * hook for evm wallet operation
 * @returns 
 * @example
 * const { getConnectedWallet, connectWallet, disconnectWallet, autofillSupportedNetworks, withdrawalSupportedNetworks, name } = useEvm()
 */
export const useEvm = (): WalletProvider => {

  const { disconnect } = useDisconnect()
  const { networks } = useSettings()
  const withdrawalSupportedNetworks = [
    ...networks
      .filter((layer) => layer.type === 'evm')
      .map((l) => l.internal_name),
    KnownInternalNames.Networks.ZksyncMainnet,
  ]
  const autofillSupportedNetworks = [
    ...withdrawalSupportedNetworks,
    KnownInternalNames.Networks.ImmutableXMainnet,
    KnownInternalNames.Networks.ImmutableXGoerli,
    KnownInternalNames.Networks.BrineMainnet,
    KnownInternalNames.Networks.LoopringGoerli,
    KnownInternalNames.Networks.LoopringMainnet,
  ]
  const name = 'evm'
  const account = useAccount()
  const { connect } = useLux()

  const getWallet = () => {
    if (account && account.address && account.connector) {
      return {
        address: account.address,
        connector: account.connector?.id,
        providerName: name,
        icon: ResolveEVMWalletIcon({ connector: account.connector }),
      }
    }
  }

  return {
    getConnectedWallet: getWallet,
    connectWallet: connect,
    disconnectWallet: disconnect,
    autofillSupportedNetworks,
    withdrawalSupportedNetworks,
    name,
  }
}
