import { useAccount, useDisconnect } from 'wagmi'


import { KnownInternalNames } from '@luxfi/core/constants'

import type { WalletProvider } from '@/domain/types'

import { useSettings } from '@/contexts/settings'
import { useLuxEvm } from '@/luxkit'

import resolveEVMWalletIcon from './resolve-evm-icon'

const useEvmProvider = (): WalletProvider => {

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
  const { connect } = useLuxEvm()

  const getWallet = () => {
    if (account && account.address && account.connector) {
      return {
        address: account.address,
        connector: account.connector?.id,
        providerName: name,
        icon: resolveEVMWalletIcon({ connector: account.connector }),
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

export default useEvmProvider

