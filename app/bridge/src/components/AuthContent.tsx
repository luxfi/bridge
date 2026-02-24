'use client'

import React from 'react'
import AuthWizard from '@/components/Wizard/AuthWizard'
import { FormWizardProvider } from '@/context/formWizardProvider'
import { AuthStep } from '@/Models/Wizard'
import { SwapDataProvider } from '@/context/swap'

export default function AuthContent() {
  return (
    <SwapDataProvider>
      <FormWizardProvider initialStep={AuthStep.Email} initialLoading={false}>
        <AuthWizard />
      </FormWizardProvider>
    </SwapDataProvider>
  )
}
