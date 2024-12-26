import { enableStaticRendering } from 'mobx-react-lite'

import type { Network } from '@luxfi/core'

import type { SwapState } from '@/domain/types'
import SwapStore from './index'

// https://dev.to/ivandotv/mobx-server-side-rendering-with-next-js-4m18
enableStaticRendering(typeof window === "undefined")

let instance: SwapState | undefined =  undefined

const getInstance = (
  networks: Network[],
  initialFrom?: Network,
  initialTo?: Network 
): SwapState => {

    // Server side: create a new copy of the store each time 
   if (typeof window === "undefined") {
    return new SwapStore(
      networks, 
      initialTo, 
      initialFrom
    )
  }

    // Client side: create the store only once 
  if (!instance) {
    instance = new SwapStore(
      networks, 
      initialTo, 
      initialFrom
    )
  }  

  return instance
}

export default getInstance
