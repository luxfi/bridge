'use client'

import React from 'react'
import AuthWizard from '@/components/Wizard/AuthWizard'
import { FormWizardProvider } from '@/context/formWizardProvider'
import { AuthStep } from '@/Models/Wizard'
import { SwapDataProvider } from '@/context/swap'

export const dynamic = 'force-dynamic'

const AuthPage = () => {
  return (
    <SwapDataProvider>
      <FormWizardProvider initialStep={AuthStep.Email} initialLoading={false}>
        <AuthWizard />
      </FormWizardProvider>
    </SwapDataProvider>
  )
}

export default AuthPage
