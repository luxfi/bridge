import type { PropsWithChildren } from 'react'

import { TooltipProvider } from '@hanzo/ui/primitives-common'
import type { Network } from '@luxfi/core'

import SettingsProvider from '@/contexts/settings'
import SwapStateProvider from '@/contexts/swap-state'
import LuxKitProvider from '@/contexts/luxkit'
import type { AppSettings } from '@/domain/types'

const Contexts: React.FC<{
  appSettings: AppSettings,
  defaultFromNetwork?: Network  
  defaultToNetwork?: Network  
} & PropsWithChildren> = ({ 
  children,
  appSettings,
  defaultFromNetwork,  
  defaultToNetwork,  
}) => {

  return (
    <SettingsProvider appSettings={appSettings}>
      <LuxKitProvider>
        <SwapStateProvider 
          appSettings={appSettings} 
          defaultFromNetwork={defaultFromNetwork} 
          defaultToNetwork={defaultToNetwork}
          >
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </SwapStateProvider>
      </LuxKitProvider>
    </SettingsProvider>
  )
}

export default Contexts
