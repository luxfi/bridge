import React from 'react'
import { redirect } from 'next/navigation'

import { SwapDataProvider } from '@/context/swap'
import { TimerProvider } from '@/context/timerContext'
import SwapWithdrawal from '@/components/SwapWithdrawal'
import { BridgeAppSettings } from '@/Models/BridgeAppSettings'
import { useSettingsContainer } from '@/context/settings'
import getApiSettings from './getApiSettings'

const SwapDetails: React.FC<{ 
  params: { swapId: string } 
}> = async ({ 
  params 
}) => {

  const apiSettings = await getApiSettings(params.swapId)
  const settingsContainer = useSettingsContainer()
  if (apiSettings.error?.startsWith('invalid guid')) {
    redirect('/')
  }

  if (settingsContainer) {
    settingsContainer.settings = new BridgeAppSettings((apiSettings.networks) ? apiSettings : {}) 
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
