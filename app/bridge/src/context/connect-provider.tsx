'use client'
import React, { type PropsWithChildren } from 'react'
import Image from 'next/image'

import {
  RainbowKitProvider,
  darkTheme,
  type AvatarComponent,
  type DisclaimerComponent,
  getDefaultWallets, 
  getDefaultConfig
} from '@rainbow-me/rainbowkit'

import { type Chain } from 'viem'
import { WagmiProvider, type Config  } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets'

import { NetworkType } from '@/Models/CryptoNetwork'
import resolveChain from '@/lib/resolveChain'
import mainnets from '@/settings/mainnet/networks.json'
import testnets from '@/settings/testnet/networks.json'

const { wallets } = getDefaultWallets()

const isChain = (c: Chain | undefined): c is Chain => (c != undefined)
const chains = [...mainnets, ...testnets]
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

const queryClient = new QueryClient()

const ConnectProvider: React.FC<PropsWithChildren> = ({ 
  children 
}) => {

  const CustomAvatar: AvatarComponent = ({ size }) => (
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

export default ConnectProvider
