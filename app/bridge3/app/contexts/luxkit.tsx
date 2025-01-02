import { 
  createContext, 
  useContext, 
  useEffect, 
  useRef, 
  type PropsWithChildren 
} from 'react'

import { type Network } from '@luxfi/core'
import { type Chain, createClient } from 'viem'
import { createModal } from '@rabby-wallet/rabbykit'
import { createConfig as createWagmiConfig, WagmiProvider, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSettings } from './settings'
import resolveChain from '@/domain/resolve-chain'

const queryClient = new QueryClient()
const isChain = (c: Chain | undefined): c is Chain => c != undefined

interface LuxkitInitializer {
  connect: () => void
}

const LuxkitContext = createContext<LuxkitInitializer | null>(null)

export const LuxKitProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const rabbyKitRef = useRef<ReturnType<typeof createModal>>()
  const { networks } = useSettings()

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

  useEffect(() => {
    if (!rabbyKitRef.current && config) {
      rabbyKitRef.current = createModal({
        //@ts-expect-error wagmi chain types
        chains,
        wagmi: config,
        theme: 'dark',
        appName: 'Lux Bridge',
        projectId: '58a22d2bc1c793fc31c117ad9ceba8d9',
      })
    }
  }, [config])

  const connect = () => {
    rabbyKitRef.current?.open()
  }

  return (
    <LuxkitContext.Provider value={{ connect }}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
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
const useLux = (): LuxkitInitializer => {
  const luxKitRef = useContext(LuxkitContext)
  if (!luxKitRef) {
    throw new Error('useLux() must be within LuxkitInitializerContext!')
  } else {
    return luxKitRef
  }
}

export {
  LuxKitProvider as default,
  LuxkitContext,
  useLux,
}
