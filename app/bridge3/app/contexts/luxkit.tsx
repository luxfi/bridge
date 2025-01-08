import {
  type PropsWithChildren
} from 'react'
// types
import { type Chain } from 'viem'
import { type Network } from '@luxfi/core'
import resolveChain from '@/domain/resolve-chain'
import { useSettings } from '@/contexts/settings'
// lux providers
import { LuxEvmProvider } from '@/luxkit'

export const LuxKitProvider: React.FC<PropsWithChildren> = ({ children }) => {
  
  const { networks } = useSettings()
  // evm chains
  const chains = networks
    .filter((n: Network) => n.type === 'evm')
    .sort((a: Network, b: Network) => (Number(a.chain_id) - Number(b.chain_id)))
    .map(resolveChain)
    .filter((c: Chain | undefined): c is Chain => c != undefined)
  console.log("EVM CHAINS: ", chains.map((c) => (c.name)).join(', '))

  return (
    <LuxEvmProvider chains={chains}>
      {children}
    </LuxEvmProvider>
  )
}

export {
  LuxKitProvider as default,
}
