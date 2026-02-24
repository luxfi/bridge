import React from 'react'
import SwapWithdrawal from '@/components/SwapWithdrawal'
import { SwapDataProvider } from '@/context/swap'
import { TimerProvider } from '@/context/timerContext'

export const dynamic = 'force-dynamic'

const SwapDetails: React.FC<{ 
  params: { swapId: string } 
}> = () => {
  return (
    <SwapDataProvider>
      <TimerProvider>
        <SwapWithdrawal />
      </TimerProvider>
    </SwapDataProvider>
  )
}

export default SwapDetails
