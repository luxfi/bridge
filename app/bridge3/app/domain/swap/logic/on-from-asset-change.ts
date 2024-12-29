import { reaction } from 'mobx'

import type { Network, Asset } from '@luxfi/core'
import type { SwapState } from '@/domain/types'

import { SWAP_PAIRS as TELEPORT_SWAP_PAIRS } from '@/domain/constants/teleport'
import { SWAP_PAIRS as NON_TELEPORT_SWAP_PAIRS } from '@/domain/constants/non-teleport'

    // :aa NOTE: Shouldn't this use `NON_TELEPORT_SWAP_PAIRS` and `!== 'evm'` in the non-telport case??  
    // bridge2 uses this for both cases! Wierd. dunno
export default (store: SwapState) => (reaction(
  () => ({
    fromAsset: store.fromAsset,
  }),
  ({ 
    fromAsset, 
  }) => {
    store.setToNetworks(
      fromAsset ? ( // store.teleport ? (
          store.allNetworks
            .map((n: Network) => ({
              ...n,
              currencies: n.currencies.filter(
                  (c: Asset) => (TELEPORT_SWAP_PAIRS[fromAsset!.asset].includes(c.asset))
                ),
            }))
            .filter((n: Network) => n.currencies.length > 0 && n.type === 'evm')
        
        /* ) : (
          store.allNetworks
            .map((n: Network) => ({
              ...n,
              currencies: n.currencies.filter(
                  (c: Asset) => (NON_TELEPORT_SWAP_PAIRS[fromAsset!.asset].includes(c.asset))
                ),
            }))
            .filter((n: Network) => n.currencies.length > 0 && n.type !== 'evm')
        ) */ 
      ) : []  
    )  
  }
))
