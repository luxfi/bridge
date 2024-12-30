import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'

import { type Network } from '@luxfi/core'
import { type Chain, createClient } from 'viem'
import { createModal } from '@rabby-wallet/rabbykit'
import { createConfig as createWagmiConfig, WagmiProvider, http, useConfig, useConnect } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EthersProvider } from '@/contexts/ethers'
import resolveChain from '@/domain/resolve-chain'

const queryClient = new QueryClient()
const isChain = (c: Chain | undefined): c is Chain => c != undefined

const createConfig = (networks: Network[]) => {
  const chains = networks
    .filter((n: Network) => n.type === 'evm')
    .sort((a: Network, b: Network) => Number(a.chain_id) - Number(b.chain_id))
    .map(resolveChain)
    .filter(isChain)

  const config = createWagmiConfig({
    chains: chains as unknown as readonly [Chain, ...Chain[]],
    client({ chain }) {
      return createClient({ chain, transport: http() })
    },
  })

  return {
    wagmiConfig: config,
    chains,
  }
}

interface LuxkitInitializer {
  initialize: (networks: Network[]) => void
  connect: () => void
}

export const LuxkitContext = createContext<LuxkitInitializer | null>(null)

export const LuxKitProvider: React.FC<PropsWithChildren> = ({ children }) => {
  // using state vs ref because state forces an update when it changes, by definition.
  const [config, setConfig] = useState<ReturnType<typeof createConfig> | null>(null)
  const rabbyKitRef = useRef<ReturnType<typeof createModal>>()

  useEffect(() => {
    if (!rabbyKitRef.current && config) {
      rabbyKitRef.current = createModal({
        chains: config.chains,
        //@ts-expect-error wagmi config type
        wagmi: config.wagmiConfig,
        theme: 'dark',
        appName: 'Lux Bridge',
        projectId: '58a22d2bc1c793fc31c117ad9ceba8d9',
      })
    }
  }, [config])

  const initialize = (networks: Network[]) => {
    !config && setConfig(createConfig(networks))
  }

  const connect = () => {
    rabbyKitRef.current?.open()
  }

  return (
    <LuxkitContext.Provider value={{ initialize, connect }}>
      {config?.wagmiConfig ? (
        <WagmiProvider config={config.wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <EthersProvider>{children}</EthersProvider>
          </QueryClientProvider>
        </WagmiProvider>
      ) : (
        children
      )}
    </LuxkitContext.Provider>
  )
}

/**
 * Provides access to the Luxkit context.
 * @returns {LuxkitInitializer} An object containing:
 * - {Function} initialize - Initializes the Luxkit with network configurations.
 * - {Function} connect - Establishes a connection to the Luxkit.
 *
 * @example
 * const luxkit = useLux();
 * luxkit.initialize([{ chainId: 1, name: 'Ethereum Mainnet' }]); // Initialize
 * luxkit.connect(); // Connect to the Luxkit
 */
export const useLux = () => {
  const luxKitRef = useContext(LuxkitContext)
  if (!luxKitRef) {
    throw new Error('useLux() must be within LuxkitInitializerContext!')
  } else {
    return luxKitRef
  }
}

export default LuxKitProvider
