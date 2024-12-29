import { type Network } from '@luxfi/core'

interface AppSettings {
  networks: Network[]
  swapPairs: Record<string, string[]>
}

export {
  type AppSettings as default
}

