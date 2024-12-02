import { getDefaultConfig } from "@rabby-wallet/rabbykit";
import { createClient, type Chain } from "viem";
import { createConfig, http } from "wagmi";
import resolveChain from '@/lib/resolveChain'
import { NetworkType } from '@/Models/CryptoNetwork'


import mainnets from '@/settings/mainnet/networks.json'
import testnets from '@/settings/testnet/networks.json'

//const { wallets } = getDefaultWallets()

const isChain = (c: Chain | undefined): c is Chain => (c != undefined)
const chains = [...mainnets as Chain[], ...testnets as Chain[]]
  .filter((n) => (n.type === NetworkType.EVM))
  .sort((a, b) => (Number(a.chain_id) - Number(b.chain_id)))
  .map(resolveChain)
  .filter(isChain)


const configParams = getDefaultConfig({
  projectId: 'e89228fed40d4c6e9520912214dfd68b',
  appName: "Lux Bridge",
  chains: [chains as Chain[]] as readonly [Chain[]],
  client({ chain } : { chain: Chain}) {
    return createClient({ chain, transport: http() });
  },
});

export const config = createConfig(configParams);
