import { createContext, useRef, useState, type PropsWithChildren } from 'react'

import  { type Chain, createClient } from 'viem'
import { createConfig as createWagmiConfig, WagmiProvider, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Network } from '@luxfi/core'

import resolveChain from '@/lib/resolve-chain'

const queryClient = new QueryClient()

const isChain = (c: Chain | undefined): c is Chain => c != undefined

const createConfig = (networks: Network[]) => {

  const chains = networks
    .filter((n: Network) => n.type === 'evm')
    .sort((a: Network, b: Network) => (Number(a.chain_id) - Number(b.chain_id)))
    .map(resolveChain)
    .filter(isChain)


  return createWagmiConfig({
    chains: chains as unknown as readonly [Chain, ...Chain[]],
    client({ chain }) {
      return createClient({ chain, transport: http() })
    },
  })
}

interface LuxkitInitializer {
  (networks: Network[]): void
}

export const LuxkitInitializerContext = createContext<LuxkitInitializer | null>(null)


export const LuxKitProvider: React.FC<PropsWithChildren> = ({ 
  children 
}) => {
    // using state vs ref because state forces an update when it changes, by definition.
  const [config, setConfig] = useState<ReturnType<typeof createConfig> | null>(null)

  const init = (networks: Network[]) => {
    setConfig(createConfig(networks))  
  }

  return (
    <LuxkitInitializerContext.Provider value={init} >
    { (config) ? (
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    ) : (
      children
    )} 
    </LuxkitInitializerContext.Provider>
  )
}

export default LuxKitProvider

  // const config: Config = getDefaultConfig({
  //   appName: 'Lux Bridge',
  //   projectId: 'e89228fed40d4c6e9520912214dfd68b',
  //   wallets: [
  //     ...wallets,
  //     {
  //       groupName: 'Other',
  //       wallets: [metaMaskWallet],
  //     },
  //   ],
  //   //@ts-expect-error "ignore chain type"
  //   chains: chains,
  //   ssr: true,
  //   autoConnect: true, // Automatically reconnect the wallet
  // })


