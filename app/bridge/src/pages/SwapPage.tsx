import SwapWithdrawal from '@/components/SwapWithdrawal'
import { SwapDataProvider } from '@/context/swap'
import { TimerProvider } from '@/context/timerContext'

export default function SwapPage({ params: _params }: { params: { swapId: string } }) {
  return (
    <SwapDataProvider>
      <TimerProvider>
        <SwapWithdrawal />
      </TimerProvider>
    </SwapDataProvider>
  )
}
