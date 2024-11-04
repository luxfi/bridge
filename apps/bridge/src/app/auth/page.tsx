import React from 'react'
import { redirect } from 'next/navigation'

import { useSettingsContainer } from '@/context/settings'
import { FormWizardProvider } from '@/context/formWizardProvider'
import { AuthStep } from '@/Models/Wizard'
import AuthWizard from '@/components/Wizard/AuthWizard'
import { SwapDataProvider } from '@/context/swap'
import { BridgeAppSettings } from '@/Models/BridgeAppSettings'
import getBridgeSettings from '@/util/getBridgeSettings'

const AuthPage: React.FC = async () => {

  const settings = await getBridgeSettings()
  const settingsContainer = useSettingsContainer()
  if (settings && 'error' in settings && settings.error.startsWith('invalid guid')) {
    redirect('/')
  }

  if (settingsContainer) {
    settingsContainer.settings = new BridgeAppSettings((settings && 'networks' in settings) ? settings : {}) 
  }
  return (
    <SwapDataProvider>
      <FormWizardProvider
        initialStep={AuthStep.Email}
        initialLoading={false}
      >
        <AuthWizard />
      </FormWizardProvider>
    </SwapDataProvider>
  )
}


export default AuthPage
