import React from 'react'

interface Wallet {
  address: string | `0x${string}`
  providerName: string
  icon: (props: any) => React.ReactNode
  connector?: string
  metadata?: any
  chainId?: string | number
}

export { type Wallet as default }
