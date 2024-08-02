'use client'
import { FC, useEffect } from "react"
import { useSettingsState } from "../../../context/settings"
import { useSwapDataState } from "../../../context/swap"
import Summary from "./Summary"
import useSWR from "swr"
import BridgeApiClient, { TransactionType, WithdrawType } from "../../../lib/BridgeApiClient"
import useWalletTransferOptions from "../../../hooks/useWalletTransferOptions"
import { useFee } from "../../../context/feeContext"
import { Exchange } from "../../../Models/Exchange"
import { NetworkCurrency } from "../../../Models/CryptoNetwork"
import { Layer } from "../../../Models/Layer"
import { ApiResponse } from "../../../Models/ApiResponse"

const SwapSummary: FC = () => {
    const { layers, exchanges, getExchangeAsset } = useSettingsState()
    const { swap, withdrawType } = useSwapDataState()

    const {
        source_network: source_network_internal_name,
        source_exchange: source_exchange_internal_name,
        destination_exchange: destination_exchange_internal_name,
        destination_network: destination_network_internal_name,
        source_asset,
        destination_asset,
    } = swap || {}

    // const { canDoSweepless, isContractWallet } = useWalletTransferOptions()
    const { fee: feeData, valuesChanger, minAllowedAmount } = useFee()

    const sourceLayer = layers.find(n => n.internal_name === source_network_internal_name)
    const sourceExchange = exchanges.find(e => e.internal_name === source_exchange_internal_name)
    const sourceAsset = sourceLayer ? sourceLayer?.assets?.find(currency => currency?.asset === source_asset) : getExchangeAsset(layers, sourceExchange, source_asset)

    const destinationLayer = layers?.find(l => l.internal_name === destination_network_internal_name)
    const destinationExchange = exchanges?.find(l => l.internal_name === destination_exchange_internal_name)
    const destinationAsset = destinationLayer ? destinationLayer?.assets?.find(currency => currency?.asset === destination_asset) : getExchangeAsset(layers, destinationExchange, destination_asset)

    const apiClient = new BridgeApiClient()
    const { data: sourceAssetPriceData, isLoading } = useSWR<ApiResponse<{ asset: string, price: number }>>(`/tokens/price/${sourceAsset?.asset}`, apiClient.fetcher);


    useEffect(() => {
        valuesChanger({
            amount: swap?.requested_amount?.toString(),
            destination_address: swap?.destination_address,
            from: sourceLayer,
            fromExchange: sourceExchange,
            fromCurrency: sourceAsset,
            to: destinationLayer,
            toExchange: destinationExchange,
            toCurrency: destinationAsset,
            refuel: swap?.refuel
        })
    }, [swap])

    if (!swap || (!sourceLayer && !sourceExchange) || !sourceAsset || !destinationAsset || (!destinationLayer && !destinationExchange)) {
        return <></>
    }

    const swapInputTransaction = swap?.transactions?.find(t => t.type === TransactionType.Input)
    const swapOutputTransaction = swap?.transactions?.find(t => t.type === TransactionType.Output)
    const swapRefuelTransaction = swap?.transactions?.find(t => t.type === TransactionType.Refuel)

    let fee: number | undefined
    let min_amount: number | undefined

    const walletTransferFee = feeData?.walletFee;
    const manualTransferFee = feeData?.manualFee;

    // if (isContractWallet?.ready) {
    //     if (withdrawType === WithdrawType.Wallet && canDoSweepless) {
    //         fee = walletTransferFee;
    //         min_amount = minAllowedAmount;
    //     } else {
    //         fee = manualTransferFee;
    //         min_amount = minAllowedAmount;
    //     }
    // }

    if (swap?.fee && swapOutputTransaction) {
        fee = swap?.fee
    }
    const requested_amount = (swapInputTransaction?.amount ?? swap.requested_amount) || undefined

    const destinationNetworkNativeAsset = layers.find(n => n.internal_name === destinationLayer?.internal_name)?.assets.find(a => a.is_native);
    const refuel_amount_in_usd = Number(destinationLayer?.refuel_amount_in_usd)
    const native_usd_price = Number(destinationNetworkNativeAsset?.price_in_usd)
    const currency_usd_price = Number(sourceAssetPriceData?.data?.price)

    const refuelAmountInNativeCurrency = swap?.refuel
        ? ((swapRefuelTransaction?.amount ??
            (refuel_amount_in_usd / native_usd_price))) : undefined;

    const refuelAmountInSelectedCurrency = swap?.refuel &&
        (refuel_amount_in_usd / currency_usd_price);

    // const receive_amount = fee !== undefined ? (swapOutputTransaction?.amount ?? (Number(requested_amount) - fee ?? 0 - Number(refuelAmountInSelectedCurrency))) : undefined
    // const receive_amount = Number(requested_amount) * 0.99 - Number(refuelAmountInSelectedCurrency)

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
    }>>(((sourceLayer || sourceExchange) && sourceAsset && (destinationLayer || destinationExchange) && destinationAsset && requested_amount) ?
        `/rate/${sourceLayer?.internal_name ?? sourceExchange?.internal_name}/${sourceAsset?.asset}/${destinationLayer?.internal_name ?? destinationExchange?.internal_name}/${destinationAsset?.asset}?amount=${requested_amount}&version=` : null, apiClient.fetcher, { refreshInterval: 10000 })

    return <Summary
        sourceAsset={sourceAsset}
        destinationAsset={destinationAsset}
        source={sourceExchange ?? sourceLayer}
        destination={destinationExchange ?? destinationLayer}
        requestedAmount={requested_amount}
        receiveAmount={lsFee?.data?.manual_receive_amount}
        destinationAddress={swap.destination_address}
        hasRefuel={swap?.refuel}
        refuelAmount={refuelAmountInNativeCurrency}
        fee={fee}
        exchange_account_connected={swap?.exchange_account_connected}
        exchange_account_name={swap?.exchange_account_name}
    />
}
export default SwapSummary
