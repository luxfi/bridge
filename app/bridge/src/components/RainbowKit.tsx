'use client'
import React from 'react'
import Image from 'next/image'
import resolveChain from '@/lib/resolveChain'
import {
  RainbowKitProvider,
  darkTheme,
  type AvatarComponent,
  type DisclaimerComponent,
} from '@rainbow-me/rainbowkit'
import { NetworkType } from '@/Models/CryptoNetwork'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import {
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  trustWallet,
  ledgerWallet,
  phantomWallet,
  okxWallet,
} from '@rainbow-me/rainbowkit/wallets'
//types
import { type Chain } from 'viem'
import { type Config } from 'wagmi'
import { getDefaultWallets, getDefaultConfig } from '@rainbow-me/rainbowkit'
import { useSettings } from '@/context/settings'

const { wallets } = getDefaultWallets()
const queryClient = new QueryClient()

const RainbowProvider = ({ children }: { children: React.ReactNode }) => {
  const { networks } = useSettings()

  const CustomAvatar: AvatarComponent = ({ address, ensImage, size }) => (
    <Image
      src={'/favicon.svg'}
      width={size}
      height={size}
      alt="avatar"
      className="rounded-full"
    />
  )

  const disclaimer: DisclaimerComponent = ({ Text }) => (
    <Text>Thanks for choosing the Lux Bridge!</Text>
  )
  const isChain = (c: Chain | undefined): c is Chain => c != undefined

  const chains = networks
    .filter((n) => n.type === NetworkType.EVM)
    .sort((a, b) => Number(a.chain_id) - Number(b.chain_id))
    .map(resolveChain)
    .filter(isChain)

  const config: Config = getDefaultConfig({
    appName: 'Lux Bridge',
    projectId: 'e89228fed40d4c6e9520912214dfd68b',
    wallets: [
      ...wallets,
      {
        groupName: 'Other',
        wallets: [metaMaskWallet],
      },
    ],
    //@ts-expect-error "ignore chain type"
    chains: chains,
    ssr: true,
    autoConnect: true, // Automatically reconnect the wallet
  })

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider //
          avatar={CustomAvatar}
          modalSize="compact"
          appInfo={{
            appName: 'LuxBridge',
            learnMoreUrl: 'https://docs.bridge.lux.network/',
            disclaimer: disclaimer,
          }}
          theme={darkTheme()}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default RainbowProvider
