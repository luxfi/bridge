import { createContext, useContext, useEffect, useRef, type PropsWithChildren } from 'react'

import type { Network } from '@luxfi/core'

import type { SwapState, AppSettings } from '@/domain/types'
import getInstance from '@/domain/swap/get-instance'
import SwapStore from '@/domain/swap/store'
import { useSettings } from './settings'

const SwapStateContext = createContext<React.MutableRefObject<SwapState> | null>(null)

const SwapStateProvider: React.FC<{
  appSettings: AppSettings,
  defaultFromNetwork?: Network,
  defaultToNetwork?: Network,
} & PropsWithChildren> = ({ 
  children, 
  appSettings,
  defaultFromNetwork,
  defaultToNetwork
}) => {

  const swapStateRef = useRef<SwapState>(getInstance(
    appSettings,
    defaultFromNetwork,
    defaultToNetwork
  ))

  useEffect(() => {
    if (swapStateRef.current) {
      (swapStateRef.current as SwapStore).initialize()
    }

    return () => {
      if (swapStateRef.current) {
        (swapStateRef.current as SwapStore).dispose()
      }
    }
  }, [])

  return (
    <SwapStateContext.Provider value={swapStateRef}>
      {children}
    </SwapStateContext.Provider>
  )
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
  useSwapState,
}
