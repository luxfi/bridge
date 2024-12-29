import { createContext, useContext, useEffect, useRef, type PropsWithChildren } from 'react'

import type { Network } from '@luxfi/core'

import type { AppSettings, SwapState } from '@/domain/types'
import getInstance from '@/domain/swap/get-instance'
import type SwapStore from '@/domain/swap/store'

const SwapStateContext = createContext<React.MutableRefObject<SwapState | null> | null>(null)

const SwapStateProvider: React.FC<PropsWithChildren> = ({ 
  children, 
}) => {

  const swapStateRef = useRef<SwapState | null>(null)
  useEffect(() => (() => {
    if (swapStateRef.current) {
      (swapStateRef.current as SwapStore).dispose()
    }
  }), [])

  return (
    <SwapStateContext.Provider value={swapStateRef}>
      {children}
    </SwapStateContext.Provider>
  )
}

const useInitializeSwapState = (
  settings: AppSettings,
  initialTo?: Network, 
  initialFrom?: Network
): void => {

  const ref = useContext(SwapStateContext)

  if (!ref ) {
    throw new Error('useInitializeSwapState() must be used within the scope of a SwapStateProvider!')
  }

  if (ref.current) {
    ref.current.setSettings(
      settings,
      initialTo, 
      initialFrom
    )
  }
  else {
    ref.current = getInstance(
      settings,
      initialTo, 
      initialFrom
    )
  }
}

const useSwapState = (): SwapState => {

  const ref = useContext(SwapStateContext)

  if (!ref || !ref.current) {
    throw new Error('SwapStateProvider or SwapState not ititialized!')
  }

  return ref.current
};

export {
  SwapStateProvider as default,
  SwapStateContext,
  useInitializeSwapState,  
  useSwapState,
}
