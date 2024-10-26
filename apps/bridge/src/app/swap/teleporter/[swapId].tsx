import React from "react"
import { redirect } from 'next/navigation'

import { useSettingsContainer } from '@/context/settings'

import { BridgeAppSettings } from '@/Models/BridgeAppSettings'
import SwapProcess from "@/components/lux/teleport/process"
import getApiSettings from '../getApiSettings'

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
    <SwapProcess swapId={params.swapId} />
  )
}

export default SwapDetails
