import React, { type PropsWithChildren } from "react"

import {
  Chain,
  WagmiConfig,
  configureChains,
  createConfig,
  mainnet,
  sepolia
} from "wagmi"
import { publicProvider } from 'wagmi/providers/public'

import {
  connectorsForWallets,
  RainbowKitProvider,
  DisclaimerComponent,
  AvatarComponent
} from '@rainbow-me/rainbowkit'

import {
  walletConnectWallet,
  rainbowWallet,
  metaMaskWallet,
  coinbaseWallet,
  bitgetWallet,
  argentWallet,
  phantomWallet
} from '@rainbow-me/rainbowkit/wallets'

import { useSettingsState } from "../context/settings"
import { NetworkType } from "../Models/CryptoNetwork"
import resolveChain from "../lib/resolveChain"
import AddressIcon from "./AddressIcon"
import configureRKTheme from "../styles/configureRKTheme"

const rkTheme = configureRKTheme()
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

const RainbowKitComponent: React.FC<PropsWithChildren> = ({ children }) => {

  const settings = useSettingsState();
  const isChain = (c: Chain | undefined): c is Chain => c != undefined
  const settingsChains = settings?.layers
    .sort((a, b) => Number(a.chain_id) - Number(b.chain_id))
    .filter(net => net.type === NetworkType.EVM
      && net.nodes?.some(n => n.url?.length > 0))
    .map(resolveChain).filter(isChain)

  const lux = {
    "id": 7777,
    "network": "homestead",
    "name": "Lux",
    "nativeCurrency": {
      "name": "LUX",
      "symbol": "LUX",
      "decimals": 18
    },
    "rpcUrls": {
      "default": {
        "http": [
          "https://api.lux.network"
        ]
      },
      "public": {
        "http": [
          "https://api.lux.network"
        ]
      }
    },
    "blockExplorers": {
      "etherscan": {
        "name": "Lux Explorer",
        "url": "https://explore.lux.network"
      },
      "default": {
        "name": "Etherscan",
        "url": "https://explore.lux.network"
      }
    },
    "contracts": {
      "multicall3": {
        "address": "0xca11bde05977b3631167028862be2a173976ca11",
        "blockCreated": 14353601
      }
    }
  } as Chain

  const { chains, publicClient } = configureChains(
    // [mainnet],
    // settingsChains?.length > 0 ? [...settingsChains, sepolia] : [mainnet],
    [mainnet, sepolia, lux],
    [publicProvider()]
  )

  console.log({ mainnet })

  const connectors = connectorsForWallets([
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet({ projectId, chains }),
        walletConnectWallet({ projectId, chains }),
      ],
    },
    {
      groupName: 'Wallets',
      wallets: [
        coinbaseWallet({ chains, appName: 'Bridge' }),
        argentWallet({ projectId, chains }),
        bitgetWallet({ projectId, chains }),
        rainbowWallet({ projectId, chains }),
        phantomWallet({ chains })
      ],
    }
  ])


  const wagmiConfig = createConfig({
    autoConnect: true,
    connectors,
    publicClient,
  })

  const disclaimer: DisclaimerComponent = ({ Text }) => (
    <Text>
      Thanks for choosing the Lux Bridge!
    </Text>
  )

  const CustomAvatar: AvatarComponent = ({ address, size }) => {
    return <AddressIcon address={address} size={size} />
  }

  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider
        avatar={CustomAvatar}
        modalSize="compact"
        chains={chains}
        theme={rkTheme}
        appInfo={{
          appName: 'LuxBridge',
          learnMoreUrl: 'https://docs.bridge.lux.network/',
          disclaimer: disclaimer
        }}
      >
        {children}
      </RainbowKitProvider>
    </WagmiConfig>
  )
}

export default RainbowKitComponent
