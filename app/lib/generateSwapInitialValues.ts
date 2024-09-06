import { SwapFormValues } from "../components/DTOs/SwapFormValues";
import { QueryParams } from "../Models/QueryParams";
import { isValidAddress } from "./addressValidator";
import { FilterDestinationLayers, FilterSourceLayers } from "../helpers/settingsHelper";
import { BridgeAppSettings } from "../Models/BridgeAppSettings";
import { SwapItem } from "./BridgeApiClient";
import { Layer } from "../Models/Layer";
import { Exchange } from "../Models/Exchange";
import { NetworkCurrency } from "../Models/CryptoNetwork";

export function generateSwapInitialValues(settings: BridgeAppSettings, queryParams: QueryParams): SwapFormValues {
    const { destAddress, amount, asset, from, to, lockAsset } = queryParams
    const { layers, getExchangeAsset } = settings || {}

    const lockedCurrency = lockAsset ? layers.find(l => l.internal_name === to)?.assets?.find(c => c?.asset?.toUpperCase() === asset?.toUpperCase()) : undefined
    const sourceLayer = layers.find(l => l.internal_name.toUpperCase() === from?.toUpperCase())
    const destinationLayer = layers.find(l => l.internal_name.toUpperCase() === to?.toUpperCase())

    const sourceItems = FilterSourceLayers(layers, destinationLayer, lockedCurrency)
    const destinationItems = FilterDestinationLayers(layers, sourceLayer, lockedCurrency)

    const initialSource = sourceLayer ? sourceItems.find(i => i == sourceLayer) : undefined
    const initialDestination = destinationLayer ? destinationItems.find(i => i === destinationLayer) : undefined

    const filteredCurrencies = lockedCurrency ? [lockedCurrency] : layers.find(l => l.internal_name === to)?.assets

    let initialAddress =
        destAddress && initialDestination && isValidAddress(destAddress, destinationLayer) ? destAddress : "";

    let initialCurrency =
        filteredCurrencies?.find(c => c.asset?.toUpperCase() == asset?.toUpperCase()) || filteredCurrencies?.[0]

    let initialAmount =
        (lockedCurrency && amount) || (initialCurrency ? amount : '')

    const result: SwapFormValues = {
        from: initialSource,
        to: initialDestination,
        amount: initialAmount,
        toCurrency: initialCurrency,
        destination_address: initialAddress ? initialAddress : '',
    }
    return result
}

export function generateSwapInitialValuesFromSwap(swap: SwapItem, settings: BridgeAppSettings): SwapFormValues {
    const {
        requested_amount,
        source_network,
        source_exchange,
        source_asset,
        destination_network,
        destination_exchange,
        destination_asset,
        destination_address,
        refuel
    } = swap

    const { layers, exchanges, getExchangeAsset } = settings || {}

    const from = layers.find(n => n.internal_name === source_network);
    const fromExchange = exchanges.find(e => e.internal_name === source_exchange);
    const fromCurrency = from ? from?.assets?.find(currency => currency?.asset === source_asset) : getExchangeAsset (layers, fromExchange, source_asset)
    const to = layers?.find(l => l.internal_name === destination_network);
    const toExchange = exchanges?.find(l => l.internal_name === destination_exchange);
    const toCurrency = to ? to?.assets?.find(currency => currency?.asset === destination_asset) : getExchangeAsset (layers, fromExchange, destination_asset)
    
    
    const result: SwapFormValues = {
        from,
        fromExchange,
        fromCurrency,
        to,
        toExchange,
        toCurrency,
        amount: requested_amount?.toString(),
        destination_address,
        refuel: refuel
    }

    return result
}