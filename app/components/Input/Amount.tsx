'use client'
import { useFormikContext } from "formik";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SwapFormValues } from "../DTOs/SwapFormValues";
import NumericInput from "./NumericInput";
import SecondaryButton from "../buttons/secondaryButton";
import { useBalancesState, useBalancesUpdate } from "../../context/balances";
import { truncateDecimals } from "../utils/RoundDecimals";
import { useFee } from "../../context/feeContext";
import useWallet from "../../hooks/useWallet";
import useBalance from "../../hooks/useBalance";

const AmountField = forwardRef(function AmountField(_, ref: any) {
    
    const { values, setFieldValue, handleChange } = useFormikContext<SwapFormValues>();
    const [requestedAmountInUsd, setRequestedAmountInUsd] = useState<string>();
    const { fromCurrency, from, to, destination_address, toCurrency, currencyGroup } = values || {};
    const { minAllowedAmount, maxAllowedAmount: maxAmountFromApi } = useFee()
    const [isAmountVisible, setIsAmountVisible] = useState(false);

    const { balances, isBalanceLoading, gases, isGasLoading } = useBalancesState()
    const { getAutofillProvider: getProvider } = useWallet()
    const provider = useMemo(() => {
        return values.from && getProvider(values.from)
    }, [values.from, getProvider])

    const wallet = provider?.getConnectedWallet()
    const gasAmount = gases[from?.internal_name || '']?.find(g => g?.token === fromCurrency?.asset)?.gas || 0
    const { fetchBalance, fetchGas } = useBalance()

    const name = "amount"
    const walletBalance = wallet && balances[wallet.address]?.find(b => b?.network === from?.internal_name && b?.token === fromCurrency?.asset)

    const maxAllowedAmount = (walletBalance &&
        maxAmountFromApi &&
        minAllowedAmount &&
        ((walletBalance.amount - gasAmount) >= minAllowedAmount &&
            (walletBalance.amount - gasAmount) <= maxAmountFromApi)) ?
        walletBalance.amount - Number(gasAmount)
        : maxAmountFromApi

    const maxAllowedDisplayAmount = maxAllowedAmount && truncateDecimals(maxAllowedAmount, fromCurrency?.precision)

    const placeholder = (fromCurrency && toCurrency && from && to && minAllowedAmount && !isBalanceLoading && !isGasLoading) ? `${minAllowedAmount} - ${maxAllowedDisplayAmount}` : '0.0'
    const step = 1 / Math.pow(10, fromCurrency?.precision || 1)
    const amountRef = useRef(ref)

    const updateRequestedAmountInUsd = useCallback((requestedAmount: number) => {
        if (fromCurrency?.price_in_usd && !isNaN(requestedAmount)) {
            setRequestedAmountInUsd((fromCurrency?.price_in_usd * requestedAmount).toFixed(2));
        } else {
            setRequestedAmountInUsd(undefined);
        }
    }, [requestedAmountInUsd, fromCurrency]);

    const handleSetMinAmount = () => {
        setFieldValue(name, minAllowedAmount);
        if (minAllowedAmount)
            updateRequestedAmountInUsd(minAllowedAmount);
    }

    const handleSetMaxAmount = useCallback(async () => {
        from && await fetchBalance(from);
        from && fromCurrency && fetchGas(from, fromCurrency, destination_address || "");
        setFieldValue(name, maxAllowedAmount);
        if (maxAllowedAmount)
            updateRequestedAmountInUsd(maxAllowedAmount)
    }, [from, to, fromCurrency, destination_address, maxAllowedAmount])

    useEffect(() => {
        values.from && fetchBalance(values.from);
    }, [values.from, values.destination_address, wallet?.address])

    useEffect(() => {
        values.to && fetchBalance(values.to);
    }, [values.to, values.destination_address, wallet?.address])

    const contract_address = values?.from?.assets.find(a => a.asset === values?.fromCurrency?.asset)?.contract_address

    useEffect(() => {
        wallet?.address && values.from && values.fromCurrency && fetchGas(values.from, values.fromCurrency, values.destination_address || wallet.address)
    }, [contract_address, values.from, values.fromCurrency, wallet?.address])

    return (<>
        {/* <AmountLabel detailsAvailable={!!(from && to && amount)}
            maxAllowedAmount={maxAllowedDisplayAmount}
            minAllowedAmount={minAllowedAmount}
            isBalanceLoading={(isBalanceLoading || isGasLoading)}
        /> */}
        <div className="flex w-full justify-between items-center">
            <div className="relative w-full">
                <NumericInput
                    disabled={
                        (!values.from && !values.fromExchange) || (!values.fromCurrency && !values.currencyGroup) ||
                        (!values.to && !values.toExchange) || (!values.toCurrency && !values.currencyGroup)
                    }
                    placeholder={placeholder}
                    min={minAllowedAmount}
                    max={maxAllowedAmount}
                    step={isNaN(step) ? 0.01 : step}
                    name={name}
                    ref={amountRef}
                    precision={fromCurrency?.precision}
                    onFocus={() => {setIsAmountVisible(false)}}
                    onBlur={() => {setIsAmountVisible(true)}}
                    className="rounded-r-none w-full pl-0.5 p-0 focus:ring-0 h-fit"
                    onChange={e => {
                        /^[0-9]*[.,]?[0-9]*$/.test(e.target.value) && handleChange(e);
                        updateRequestedAmountInUsd(parseFloat(e.target.value));
                    }}
                >
                    {/* {requestedAmountInUsd && isAmountVisible ? (
                        <span className="absolute text-xs right-0 bottom-[2px]">
                            (${requestedAmountInUsd})
                        </span>
                    ) : null} */}
                </NumericInput>
            </div>
            {
                from && to && fromCurrency ?
                    <div className="flex flex-col justify-center">
                        <div className="text-xs flex flex-col items-center space-x-1 md:space-x-2 ml-2 md:ml-5 px-2">
                            <div className="flex">
                                <SecondaryButton disabled={!minAllowedAmount} onClick={handleSetMinAmount} size="xs">
                                    MIN
                                </SecondaryButton>
                                <SecondaryButton disabled={!maxAllowedAmount} onClick={handleSetMaxAmount} size="xs" className="ml-1.5">
                                    MAX
                                </SecondaryButton>
                            </div>
                        </div>
                    </div>
                    :
                    <></>
            }
        </div >
    </>)
});

type AmountLabelProps = {
    detailsAvailable: boolean;
    minAllowedAmount: number | undefined;
    maxAllowedAmount: number | undefined;
    isBalanceLoading: boolean;
}
const AmountLabel = ({
    detailsAvailable,
    minAllowedAmount,
    maxAllowedAmount,
    isBalanceLoading,
}: AmountLabelProps) => {
    return <div className="flex items-center w-full justify-between">
        <div className="flex items-center space-x-2">
            <p className="block font-semibold text-muted text-xs mb-1">Amount</p>
            {/* {
                detailsAvailable &&
                <div className="text-xs hidden md:flex  items-center">
                    <span>(Min:&nbsp;</span>{isBalanceLoading ? <span className="ml-1 h-3 w-6 rounded-sm bg-gray-500 animate-pulse" /> : <span>{minAllowedAmount}</span>}
                    <span>&nbsp;-&nbsp;Max:&nbsp;</span>{isBalanceLoading ? <span className="ml-1 h-3 w-6 rounded-sm bg-gray-500 animate-pulse" /> : <span>{maxAllowedAmount}</span>}<span>)</span>
                </div>
            } */}
        </div>
    </div>
}

export default AmountField