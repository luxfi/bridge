'use client'
import { useEffect } from 'react'
import { useSwapDataState, useSwapDataUpdate } from '../context/swap'
import SwapDetails from './Swap'
import Widget from './Widget'
import NotFound from './Swap/NotFound'
import { BalancesDataProvider } from '../context/balances'

const SwapWithdrawal: React.FC = () => {
  const { swap, swapApiError } = useSwapDataState()
  const { mutateSwap } = useSwapDataUpdate()

  useEffect(() => {
    mutateSwap()
  }, [])

  return swap ? (
    <BalancesDataProvider>
      <SwapDetails type="widget" />
    </BalancesDataProvider>
  ) : (
    <Widget>
      <div
        className={`pb-6 rounded-lg w-full overflow-hidden relative h-[548px]`}
      >
        {swapApiError && <NotFound />}
      </div>
    </Widget>
  )
}

export default SwapWithdrawal
