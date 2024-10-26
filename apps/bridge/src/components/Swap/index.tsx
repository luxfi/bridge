'use client'
import Widget from '../Widget/Index'
import { useSwapDataState } from '../../context/swap'
import Withdraw from './Withdraw'
import Processing from './Withdraw/Processing'
import { PublishedSwapTransactionStatus, TransactionType } from '../../lib/BridgeApiClient'
import { SwapStatus } from '../../Models/SwapStatus'
import GasDetails from '../gasDetails'
import { useSettings } from '../../context/settings'

import { useSwapTransactionStore } from '../../stores/swapTransactionStore'
import type React from 'react'
import type { PropsWithChildren } from 'react'

type Type = "widget" | "contained"

const SwapDetails: React.FC<{
  type: Type,
}> = ({ 
  type 
}) => {
    const { swap } = useSwapDataState()
    const settings = useSettings()
    const swapStatus = swap?.status
    const storedWalletTransactions = useSwapTransactionStore()

    const swapInputTransaction = swap?.transactions?.find(t => t.type === TransactionType.Input)
    const storedWalletTransaction = storedWalletTransactions.swapTransactions?.[swap?.id || '']

    const sourceNetwork = settings.layers.find(l => l.internal_name === swap?.source_network)
    const currency = sourceNetwork?.assets.find(c => c.asset === swap?.source_asset)


    if (!swap) {
        return (
            <div className="w-full h-[430px]">
                <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-6 py-1">
                        <div className="h-32 bg-level-1 rounded-lg"></div>
                        <div className="h-40 bg-level-1 rounded-lg"></div>
                        <div className="h-12 bg-level-1 rounded-lg"></div>
                    </div>
                </div>
            </div>
        )
    } else {
        return (
            <>
                <Container type={type}>
                    {
                        ((swapStatus === SwapStatus.UserTransferPending
                            && !(swapInputTransaction || (storedWalletTransaction && storedWalletTransaction.status !== PublishedSwapTransactionStatus.Error)))) ?
                            <Withdraw /> : <Processing />
                    }
                </Container>
                {
                    process.env.NEXT_PUBLIC_SHOW_GAS_DETAILS === 'true'
                    && sourceNetwork
                    && currency &&
                    <GasDetails network={sourceNetwork} currency={currency} />
                }
            </>
        )
    }
}

const Container: React.FC<{
  type: Type
} & PropsWithChildren> = ({
  type,
  children
}) => ((type === "widget") ? (
  <Widget><>{children}</></Widget>
) : (
  <div className="w-full flex flex-col justify-between h-full space-y-2">
    {children}
  </div>
))

export default SwapDetails
