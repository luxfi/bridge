import React from 'react'
import { redirect } from 'next/navigation'

import { useSettingsContainer } from '@/context/settings'

import { BridgeAppSettings } from '@/Models/BridgeAppSettings'
import SwapProcess from '@/components/lux/teleport/process'
import getBridgeSettings from '@/util/getBridgeSettings'

const SwapDetails: React.FC<{
  params: { swapId: string }
}> = ({ params }) => {
  // const settings = await getBridgeSettings(params.swapId)
  // const settingsContainer = useSettingsContainer()
  // if (
  //   settings &&
  //   'error' in settings &&
  //   settings.error.startsWith('invalid guid')
  // ) {
  //   redirect('/')
  // }

  // if (settingsContainer) {
  //   settingsContainer.settings = new BridgeAppSettings(
  //     settings && 'networks' in settings ? settings : {}
  //   )
  // }
  return <SwapProcess swapId={params.swapId} className="my-20" />
}

export default SwapDetails
