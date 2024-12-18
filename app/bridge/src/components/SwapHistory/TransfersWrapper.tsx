'use client'
import TransactionsHistory from './index'
import { useAuthState, UserType } from '@/context/authContext'
import { FormWizardProvider } from '@/context/formWizardProvider'
import { TimerProvider } from '@/context/timerContext'
import { AuthStep } from '@/Models/Wizard'
import GuestCard from '../guestCard'

const TransfersWrapper: React.FC = () => {
  const { userType } = useAuthState()

  return (
    <div className="py-20">
      <TransactionsHistory />
      {/* {userType && userType != UserType.AuthenticatedUser && (
        <FormWizardProvider
          initialStep={AuthStep.Email}
          initialLoading={false}
          hideMenu
        >
          <TimerProvider>
            <GuestCard />
          </TimerProvider>
        </FormWizardProvider>
      )} */}
    </div>
  )
}

export default TransfersWrapper
