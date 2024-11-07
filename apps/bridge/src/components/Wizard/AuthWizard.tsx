'use client'
import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useFormWizardaUpdate } from '@/context/formWizardProvider'
import { TimerProvider } from '@/context/timerContext'
import { AuthStep, SwapCreateStep } from '@/Models/Wizard'
import CodeStep from './Steps/CodeStep'
import EmailStep from './Steps/EmailStep'
import Wizard from './Wizard'
import WizardItem from './WizardItem'
import resolvePersistentQueryParams from '@/util/resolvePersistentQueryParams'
import type { AuthConnectResponse } from '@/Models/BridgeAuth'


const AuthWizard: React.FC = () => {

  const { goToStep } = useFormWizardaUpdate()

  const router = useRouter()
  const searchParams = useSearchParams()
  const paramsString = resolvePersistentQueryParams(searchParams).toString()

  const codeOnNext = useCallback(async (_: AuthConnectResponse) => {
    router.push(paramsString ? `/?${paramsString}` : '/')
  }, [paramsString])

  const goBackToEmailStep = useCallback(() => {goToStep(AuthStep.Email, 'back')}, [])
  const goToCodeStep = useCallback(() => {goToStep(AuthStep.Code)}, [])

  const handleGoBack = useCallback(() => {
      router.back()
  }, [router])

  return (
    <TimerProvider>
      <Wizard>
        <WizardItem StepName={SwapCreateStep.Email} GoBack={handleGoBack}>
          <EmailStep OnNext={goToCodeStep} />
        </WizardItem>
        <WizardItem StepName={SwapCreateStep.Code} GoBack={goBackToEmailStep}>
          <CodeStep OnNext={codeOnNext} />
        </WizardItem>
      </Wizard>
    </TimerProvider>
  )
}

export default AuthWizard
