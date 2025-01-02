import type { PropsWithChildren } from 'react'

import { TooltipProvider } from '@hanzo/ui/primitives-common'
import type { Network } from '@luxfi/core'

import SettingsProvider from '@/contexts/settings'
import SwapStateProvider from '@/contexts/swap-state'
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
      <SwapStateProvider 
        appSettings={appSettings} 
        defaultFromNetwork={defaultFromNetwork} 
        defaultToNetwork={defaultToNetwork}
      >
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </SwapStateProvider>
    </SettingsProvider>
  )
}

export default Contexts
