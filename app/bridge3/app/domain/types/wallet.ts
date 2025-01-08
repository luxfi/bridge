interface Wallet {
  address: string | `0x${string}`
  providerName: string
  icon: (props: any) => JSX.Element
  connector?: string
  metadata?: any
  chainId?: string | number
}

export { type Wallet as default }
