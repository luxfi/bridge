import type { PropsWithChildren } from 'react'

import SettingsProvider from '@/contexts/settings'
import SwapStateProvider from '@/contexts/swap-state'

const Contexts: React.FC<PropsWithChildren> = ({ 
  children 
}) => {

  return (
    <SettingsProvider >
    <SwapStateProvider>
      {children}
    </SwapStateProvider>
    </SettingsProvider>
  )
}

export default Contexts
