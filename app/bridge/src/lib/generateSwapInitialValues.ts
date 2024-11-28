import { type SwapFormValues } from "../components/DTOs/SwapFormValues";
import { QueryParams } from "../Models/QueryParams";
import { isValidAddress } from "./addressValidator";
import { FilterDestinationLayers, FilterSourceLayers } from "../util/settingsHelper";
import { BridgeAppSettings } from "../Models/BridgeAppSettings";
import { type SwapItem } from "./BridgeApiClient";

export function generateSwapInitialValues(settings: BridgeAppSettings, queryParams: QueryParams): SwapFormValues {
    const { destAddress, amount, asset, from, to, lockAsset } = queryParams
    const { networks, getExchangeAsset } = settings || {}

    const lockedCurrency = lockAsset ? networks.find(l => l.internal_name === to)?.currencies?.find(c => c?.asset?.toUpperCase() === asset?.toUpperCase()) : undefined
    const sourceLayer = networks.find(l => l.internal_name.toUpperCase() === from?.toUpperCase())
    const destinationLayer = networks.find(l => l.internal_name.toUpperCase() === to?.toUpperCase())

    const sourceItems = FilterSourceLayers(networks, destinationLayer, lockedCurrency)
    const destinationItems = FilterDestinationLayers(networks, sourceLayer, lockedCurrency)

    const initialSource = sourceLayer ? sourceItems.find(i => i == sourceLayer) : undefined
    const initialDestination = destinationLayer ? destinationItems.find(i => i === destinationLayer) : undefined

    const filteredCurrencies = lockedCurrency ? [lockedCurrency] : networks.find(l => l.internal_name === to)?.currencies

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

    const { networks, exchanges, getExchangeAsset } = settings || {}

    const from = networks.find(n => n.internal_name === source_network);
    const fromExchange = exchanges.find(e => e.internal_name === source_exchange);
    const fromCurrency = from ? from?.currencies?.find(currency => currency?.asset === source_asset) : getExchangeAsset (networks, fromExchange, source_asset)
    const to = networks?.find(l => l.internal_name === destination_network);
    const toExchange = exchanges?.find(l => l.internal_name === destination_exchange);
    const toCurrency = to ? to?.currencies?.find(currency => currency?.asset === destination_asset) : getExchangeAsset (networks, fromExchange, destination_asset)
    
    
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