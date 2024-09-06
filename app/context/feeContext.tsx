'use client'
import BridgeApiClient from '../lib/BridgeApiClient';
import useSWR from 'swr';
import { ApiResponse } from '../Models/ApiResponse';
import { createContext, useState, useContext, useEffect } from 'react'
import { SwapFormValues } from '../components/DTOs/SwapFormValues';

const FeeStateContext = createContext<ContextType | null>(null);

type ContextType = {
    minAllowedAmount: number | undefined,
    maxAllowedAmount: number | undefined,
    fee: Fee,
    mutateFee: () => void,
    valuesChanger: (values: SwapFormValues) => void,
    isFeeLoading: boolean
}

export type Fee = {
    walletFee: number | undefined,
    manualFee: number | undefined,
    avgCompletionTime: {
        total_minutes: number,
        total_seconds: number,
        total_hours: number
    } | undefined;
    walletReceiveAmount: number | undefined,
    manualReceiveAmount: number | undefined
}

export function FeeProvider({ children }) {

    const [values, setValues] = useState<SwapFormValues>()
    const { fromCurrency, toCurrency, from, to, toExchange, amount, fromExchange, currencyGroup } = values || {}
    const [debouncedAmount, setDebouncedAmount] = useState(amount);

    const valuesChanger = (values: SwapFormValues) => {
        setValues(values)
    }

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedAmount(amount);
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [amount, 1000]);

    const apiClient = new BridgeApiClient()
    const version = BridgeApiClient.apiVersion



    const { data: amountRange } = useSWR<ApiResponse<{
        manual_min_amount: number
        manual_min_amount_in_usd: number
        max_amount: number
        max_amount_in_usd: number
        wallet_min_amount: number
        wallet_min_amount_in_usd: number
    }>>(((from || fromExchange) && (fromCurrency || currencyGroup) && (to || toExchange) && (toCurrency || currencyGroup)) ?
        `/limits/${from?.internal_name ?? fromExchange?.internal_name}/${fromCurrency?.asset ?? currencyGroup?.name}/${to?.internal_name ?? toExchange?.internal_name}/${toCurrency?.asset ?? currencyGroup?.name}?version=${version}` : null, apiClient.fetcher, {
        refreshInterval: 10000,
    })

    const { data: lsFee, mutate: mutateFee, isLoading: isFeeLoading } = useSWR<ApiResponse<{
        wallet_fee_in_usd: number,
        wallet_fee: number,
        wallet_receive_amount: number,
        manual_fee_in_usd: number,
        manual_fee: number,
        manual_receive_amount: number,
        avg_completion_time: {
            total_minutes: number,
            total_seconds: number,
            total_hours: number
        },
        fee_usd_price: number
    }>>(((from || fromExchange) && (fromCurrency || currencyGroup) && (to || toExchange) && (toCurrency || currencyGroup) && amount) ?
        `/rate/${from?.internal_name ?? fromExchange?.internal_name}/${fromCurrency?.asset ?? currencyGroup?.name}/${to?.internal_name ?? toExchange?.internal_name}/${toCurrency?.asset ?? currencyGroup?.name}?amount=${amount}&version=${version}` : null, apiClient.fetcher, { refreshInterval: 10000 })

    const fee = {
        walletFee: lsFee?.data?.wallet_fee,
        manualFee: lsFee?.data?.manual_fee,
        walletReceiveAmount: lsFee?.data?.wallet_receive_amount,
        manualReceiveAmount: lsFee?.data?.manual_receive_amount,
        avgCompletionTime: lsFee?.data?.avg_completion_time
    }

    return (
        <FeeStateContext.Provider value={{ minAllowedAmount: amountRange?.data?.manual_min_amount, maxAllowedAmount: amountRange?.data?.max_amount, fee, mutateFee, valuesChanger, isFeeLoading }}>
            {children}
        </FeeStateContext.Provider>
    )
}

export function useFee() {
    const data = useContext(FeeStateContext);

    if (data === null) {
        throw new Error('useFee must be used within a FeeProvider');
    }

    return data;
}
