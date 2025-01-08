import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  type PropsWithChildren
} from 'react'

import { createModal } from '@rabby-wallet/rabbykit'
import { createConfig as createWagmiConfig, WagmiProvider, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient, type Chain } from 'viem'

const queryClient = new QueryClient()

interface LuxkitInitializer {
  connect: () => void
}

const LuxEvmContext = createContext<LuxkitInitializer | null>(null)

interface LuxEvmProviderProps {
  chains: Chain[];
}

const LuxEvmProvider: React.FC<PropsWithChildren<LuxEvmProviderProps>> = ({ children, chains }) => {

  const connectFnRef = useRef<ReturnType<typeof createModal>>()
  const config = useMemo(() => createWagmiConfig({
    chains: chains as unknown as readonly [Chain, ...Chain[]],
    ssr: true,
    client({ chain }) {
      return createClient({ chain, transport: http() })
    },
  }), [chains])

  useEffect(() => {
    if (!connectFnRef.current) {
      connectFnRef.current = createModal({
        //@ts-expect-error wagmi chain types
        chains,
        wagmi: config,
        theme: 'dark',
        appName: 'Lux Bridge',
        projectId: '58a22d2bc1c793fc31c117ad9ceba8d9',
      })
    }
  }, [chains])

  const connect = () => {
    connectFnRef.current?.open()
  }

  return (
    <LuxEvmContext.Provider value={{ connect }}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </LuxEvmContext.Provider>
  )
}

/**
 * Provides access to the Luxkit context.
 * @returns {LuxkitInitializer} An object containing:
 * - {Function} initialize - Initializes the Luxkit with network configurations.
 * - {Function} connect - Establishes a connection to the Luxkit.
 *
 * @example
 * const luxkit = useLuxEvm();
 * luxkit.initialize([{ chainId: 1, name: 'Ethereum Mainnet' }]); // Initialize
 * luxkit.connect(); // Connect to the Luxkit
 */
const useLuxEvm = (): LuxkitInitializer => {
  const luxEvmRef = useContext(LuxEvmContext)
  if (!luxEvmRef) {
    throw new Error('useLuxEvm() must be within LuxkitInitializerContext!')
  } else {
    return luxEvmRef
  }
}

export {
  LuxEvmProvider as default,
  LuxEvmContext,
  useLuxEvm,
}
