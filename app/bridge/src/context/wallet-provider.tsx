'use client'
import React, { type PropsWithChildren } from 'react'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { config } from './wagmi-config'

const queryClient = new QueryClient()

const WalletProvider: React.FC<PropsWithChildren> = ({ 
  children 
}) => {

  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {mounted && children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default WalletProvider
