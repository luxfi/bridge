import React from 'react'
import { redirect } from 'next/navigation'

import { SwapDataProvider } from '@/context/swap'
import { TimerProvider } from '@/context/timerContext'
import SwapWithdrawal from '@/components/SwapWithdrawal'
import { BridgeAppSettings } from '@/Models/BridgeAppSettings'
import { useSettingsContainer } from '@/context/settings'
import getBridgeSettings from '@/util/getBridgeSettings'

const SwapDetails: React.FC<{ 
  params: { swapId: string } 
}> = async ({ 
  params 
}) => {

  const settings = await getBridgeSettings(params.swapId)
  const settingsContainer = useSettingsContainer()
  if (settings && 'error' in settings && settings.error.startsWith('invalid guid')) {
    redirect('/')
  }

  if (settingsContainer) {
    settingsContainer.settings = new BridgeAppSettings((settings && 'networks' in settings) ? settings : {}) 
  }
  
  return (
    <SwapDataProvider>
      <TimerProvider>
        <SwapWithdrawal />
      </TimerProvider>
    </SwapDataProvider>
  )
}

export default SwapDetails
