'use client'
import { useMemo } from "react"
import { useFormikContext } from "formik"

import { useBalancesState } from "../context/balances"
import useWallet from "../hooks/useWallet"
import WarningMessage from "./WarningMessage"
import { type SwapFormValues } from "./DTOs/SwapFormValues"
import { truncateDecimals } from "./utils/RoundDecimals"
import { useFee } from "../context/feeContext"
import type { Balance, Gas } from "../Models/Balance"

const ReserveGasNote = ({ onSubmit }: { onSubmit: (walletBalance: Balance, networkGas: Gas) => void }) => {
    const {
        values,
    } = useFormikContext<SwapFormValues>();
    const { balances, gases } = useBalancesState()
    const {minAllowedAmount } = useFee()

    const { getWithdrawalProvider: getProvider } = useWallet()
    const provider = useMemo(() => {
        return values.from && getProvider(values.from)
    }, [values.from, getProvider])

    const wallet = provider?.getConnectedWallet()

    const walletBalance = wallet && balances[wallet.address]?.find(b => b?.network === values?.from?.internal_name && b?.token === values?.fromCurrency?.asset)
    const networkGas = values.from?.internal_name ?
        gases?.[values.from?.internal_name]?.find(g => g?.token === values?.fromCurrency?.asset)
        : null

    const mightBeAutOfGas = !!(networkGas && walletBalance?.isNativeCurrency && Number(values.amount)
        + networkGas?.gas > walletBalance.amount
        && minAllowedAmount
        && walletBalance.amount > minAllowedAmount
    )
    const gasToReserveFormatted = mightBeAutOfGas ? truncateDecimals(networkGas?.gas, values?.fromCurrency?.precision) : 0

    return (
        mightBeAutOfGas && gasToReserveFormatted > 0 &&
        <WarningMessage messageType="warning" className="mt-4">
            <div className="font-normal ">
                <div>
                    You might not be able to complete the transaction.
                </div>
                <div onClick={() => onSubmit(walletBalance, networkGas)} className="cursor-pointer border-b border-dotted border-[#404040] w-fit hover:text-muted hover:border-muted ">
                    <span>Reserve</span> <span>{gasToReserveFormatted}</span> <span>{values?.fromCurrency?.asset}</span> <span>for gas.</span>
                </div>
            </div>
        </WarningMessage>
    )
}

export default ReserveGasNote