import React, { useContext } from 'react'
import type { Chain, Address, Client } from 'viem'
import { BrowserProvider, JsonRpcSigner } from 'ethers'
import { useAccount, useWalletClient, type Connector } from 'wagmi'
import { LuxkitContext } from './luxkit'
/**
 * convert viem client to ethers signer
 * this is for ethersV6
 * @param client
 * @returns Promise<JsonRpcSigner> | undefined
 */
const clientToSigner = (client: Client) => {
  const { account, chain, transport } = client
  if (!account || !chain || !transport) {
    return undefined
  }
  const provider = new BrowserProvider(transport)
  const signer = provider.getSigner(account.address)
  return signer
}

interface IEthersContext {
  chain: Chain | undefined
  address: Address | undefined
  chainId: number | undefined
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  isDisconnected: boolean
  connector: Connector | undefined
  signer: Promise<JsonRpcSigner> | undefined
}

export const EthersContext = React.createContext<IEthersContext | undefined>(undefined)

export const EthersProvider = ({ children }: Readonly<{ children: React.ReactNode }>) => {

  const luxKitRef = useContext(LuxkitContext)
  if (!luxKitRef) {
    return <></>
  }

  const { address, chain, isConnected, isConnecting, isReconnecting, connector, isDisconnected, chainId } = useAccount()
  const { data } = useWalletClient({ chainId })
  const client: Client = data as Client
  const signer = React.useMemo(() => (client ? clientToSigner(client) : undefined), [client])

  return (
    <EthersContext.Provider
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
    </EthersContext.Provider>
  )
}

/**
 * Provides access to the Ethers context.
 * @returns {IEthersContext} An object containing:
 * - chain: Chain | undefined
 * - address: Address | undefined
 * - chainId: number | undefined
 * - isConnected: boolean
 * - isConnecting: boolean
 * - isReconnecting: boolean
 * - isDisconnected: boolean
 * - connector: Connector | undefined
 * - signer: Promise<JsonRpcSigner> | undefined
 *
 * @example
 * const { chain, address, chainId, ... } = useEthersSigner()
 */
export const useEthersSigner = () => {
  const ethersRef = React.useContext(EthersContext)
  if (!ethersRef) {
    throw new Error('useEthersSigner() must be within EthersProvider!');
  } else {
    return ethersRef
  }
}
