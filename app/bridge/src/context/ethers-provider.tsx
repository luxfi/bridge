'use client'
import React, { type PropsWithChildren } from 'react'
import { type Chain, type Address, type Client } from 'viem'

import { providers } from 'ethers'
import { useAccount, useWalletClient } from 'wagmi'

function clientToSigner(client: any) {
  const { account, chain, transport } = client
  if (!account || !chain || !transport) {
    return undefined
  }
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  }
  const provider = new providers.Web3Provider(transport, network)
  const signer = provider.getSigner(account.address)
  return signer
}

interface IContext {
  chain: Chain | undefined,
  address: Address | undefined
  chainId: number | undefined
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  isDisconnected: boolean
  connector: any | undefined
  signer: any | undefined
}

const Web3Context = React.createContext<IContext | undefined>(undefined)

const useEthersSigner = () => {
  const context = React.useContext(Web3Context);
  if (!context) {
    throw new Error("");
  } 
    return context;
}


const EthersProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const { address, chain, isConnected, isConnecting, isReconnecting, connector, isDisconnected, chainId } = useAccount()
  const { data } = useWalletClient({ chainId })
  const client: Client = data as Client

  const signer = React.useMemo(() => (client ? clientToSigner(client) : undefined), [client])

  return (
    <Web3Context.Provider
      value={{
        chain,
        address,
        isConnected,
        isConnecting,
        isReconnecting,
        isDisconnected,
        connector,
        chainId,
        signer,
      }}
    >
      {children}
    </Web3Context.Provider>
  )
}

export {
  useEthersSigner,
  EthersProvider as default
}

