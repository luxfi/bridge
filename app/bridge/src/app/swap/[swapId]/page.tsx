import React from 'react'
import SwapWithdrawal from '@/components/SwapWithdrawal'
import { SwapDataProvider } from '@/context/swap'
import { TimerProvider } from '@/context/timerContext'


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
