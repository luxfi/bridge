import { enableStaticRendering } from 'mobx-react-lite'

import type { Network } from '@luxfi/core'

import type { SwapState } from '@/domain/types'
import SwapStore from './store'

// https://dev.to/ivandotv/mobx-server-side-rendering-with-next-js-4m18
enableStaticRendering(typeof window === "undefined")

let instance: SwapStore | undefined =  undefined

const getInstance = (
  networks: Network[],
  initialFrom?: Network,
  initialTo?: Network 
): SwapState => {

    // Server side: create a new copy of the store each time 
   if (typeof window === "undefined") {
    const inst = new SwapStore(
      networks, 
      initialTo, 
      initialFrom
    )
    inst.initialize()
      // TODO how to call dispose()?
    return inst
  }

    // Client side: create the store only once 
  if (!instance) {
    instance = new SwapStore(
      networks, 
      initialTo, 
      initialFrom
    )
    instance.initialize()
  }  

  return instance
}

export default getInstance
