import type { PropsWithChildren } from 'react'

import SettingsProvider from '@/contexts/settings'
import SwapStateProvider from '@/contexts/swap-state'
import { LuxKitProvider } from '@/contexts/lux-kit'

const Contexts: React.FC<PropsWithChildren> = ({ 
  children 
}) => {

  return (
    <SettingsProvider >
      <LuxKitProvider>
        <SwapStateProvider>
          {children}
        </SwapStateProvider>
      </LuxKitProvider>
    </SettingsProvider>
  )
}

export default Contexts
