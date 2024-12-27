import type { Network } from '@luxfi/core'
import type { Chain } from 'viem'
import React from 'react'
import resolveChain from '@/lib/resolve-chain'
import { createConfig, WagmiProvider, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSettings } from '@/contexts/settings'
import { createClient } from 'viem'

const queryClient = new QueryClient()

export const LuxKitProvider = ({ children }: { children: React.ReactNode }) => {
  const { networks } = useSettings()
  console.log(networks)
  // const networks = settingsRef.settings!.networks || []

  const isChain = (c: Chain | undefined): c is Chain => c != undefined

  const chains = networks
    .filter((n: Network) => n.type === 'evm')
    .sort((a: Network, b: Network) => Number(a.chain_id) - Number(b.chain_id))
    .map(resolveChain)
    .filter(isChain)


  const config = createConfig({
    //@ts-ignore 
    chains: chains,
    client({ chain }) {
      return createClient({ chain, transport: http() })
    },
  })

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

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default LuxKitProvider