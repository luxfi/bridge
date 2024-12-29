import { createContext, useContext, useEffect, type PropsWithChildren } from 'react'

import type { Network } from '@luxfi/core'

import type { SwapState } from '@/domain/types'
import getInstance from '@/domain/swap/get-instance'

interface SwapStateRef {
  swapState: SwapState | null
}

const SwapStateContext = createContext<SwapStateRef | null>(null)

const SwapStateProvider: React.FC<PropsWithChildren> = ({ 
  children, 
}) => {
  
  useEffect(() => (() => {

  }), [])
  return (
  <SwapStateContext.Provider value={{ swapState: null }}>
    {children}
  </SwapStateContext.Provider>
)}

const useInitializeSwapState = (
  networks: Network[], 
  initialTo?: Network, 
  initialFrom?: Network
): void => {

  const ref = useContext(SwapStateContext)

  if (!ref ) {
    throw new Error('useInitializeSwapState() must be used within the scope of a SwapStateProvider!')
  }

  if (ref.swapState) {
    ref.swapState.setNetworks(
      networks, 
      initialTo, 
      initialFrom
    )
  }
  else {
    ref.swapState = getInstance(
      networks, 
      initialTo, 
      initialFrom
    )
  }
}


const useSwapState = (): SwapState => {

  const ref = useContext(SwapStateContext)

  if (!ref || !ref.swapState) {
    throw new Error('SwapStateProvider or SwapState not ititialized!')
  }

  return ref.swapState
};

export {
  SwapStateProvider as default,
  SwapStateContext,
  useInitializeSwapState,  
  useSwapState,
}
