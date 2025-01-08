import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  type PropsWithChildren
} from 'react'
import resolveEVMWalletIcon from './resolve-evm-icon'
import { createModal } from '@rabby-wallet/rabbykit'
import { createConfig as createWagmiConfig, WagmiProvider, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient, type Chain } from 'viem'
import type { Wallet } from '@/domain/types'
// wagmi hooks
import { useAccount, useDisconnect } from 'wagmi'

const queryClient = new QueryClient()

interface LuxEvmInitializer {
  connect: () => void
}

const LuxEvmContext = createContext<LuxEvmInitializer | null>(null)

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


interface useLuxEvmReturn {
  connectWallet: () => void,
  disconnectWallet: () => void,
  getConnectedWallet: () => Wallet | undefined,
  // autofillSupportedNetworks,
  // withdrawalSupportedNetworks,
  name: 'evm',
}
/**
 * Provides access to the Luxkit context.
 * @returns {UseLuxEvmInitializer} An object containing:
 * - {Function} connectWallet - Establishes a connection to the Luxkit.
 * - {Functoin} disconnectWallet - Disconnect a connected wallet
 * - {Functoin} getConnectedWallet - Get a wallet instance of connected wallet
 * - {String} name - network type
 * @example
 * {
 *    connectWallet,
 *    disconnectWallet,
 *    getConnectedWallet,
 *    name,
 * } = useLuxEvm();
 * connectWallet(); // Connect evm wallet
 */
const useLuxEvm = (): useLuxEvmReturn => {
  const luxEvmRef = useContext(LuxEvmContext)
  if (!luxEvmRef) {
    throw new Error('useLuxEvm() must be within LuxkitInitializerContext!')
  }
  const account = useAccount()
  const name = 'evm'
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
  const { disconnect } = useDisconnect()
  return {
    getConnectedWallet: getWallet,
    connectWallet: luxEvmRef.connect,
    disconnectWallet: disconnect,
    // autofillSupportedNetworks,
    // withdrawalSupportedNetworks,
    name: name,
  }
}

export {
  LuxEvmProvider as default,
  LuxEvmContext,
  useLuxEvm,
}
