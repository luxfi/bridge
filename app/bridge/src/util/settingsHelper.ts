import { type CryptoNetwork, type NetworkCurrency } from "../Models/CryptoNetwork";
import { THEME_COLORS } from "../Models/Theme";

export function GetDefaultAsset(layer: CryptoNetwork, asset: string): NetworkCurrency | undefined {
    return layer
        ?.currencies
        ?.find(a => a.asset === asset)
}

export function FilterSourceLayers(networks: CryptoNetwork[], destination?: CryptoNetwork | null, lockedCurrency?: NetworkCurrency | null): CryptoNetwork[] {
    const IsAvailableForSomeLayer = (asset: string, source: CryptoNetwork) =>
        networks.some(l => IsAvailableForLayer(asset, source, l))

    const filteredLayers = networks.filter(l => {
        const isAvailable = destination?.internal_name !== l.internal_name

        const layerHasAvailableL2 = l.currencies?.some(l2Asset =>
            (!lockedCurrency || l2Asset?.asset === lockedCurrency?.asset)
            && (destination
                ? IsAvailableForLayer(l2Asset.asset, l, destination)
                : IsAvailableForSomeLayer(l2Asset.asset, l)))

        return isAvailable && layerHasAvailableL2
    })
    return filteredLayers;
}

const IsAvailableForLayer = (asset: string, source: CryptoNetwork, destination: CryptoNetwork) => {
    if (source?.internal_name === destination?.internal_name)
        return false;

    const sourceDefaultAsset = GetDefaultAsset(source, asset)
    const destinationDefaultAsset = GetDefaultAsset(destination, asset)
    const source_internal_name = source.internal_name
    const destination_internal_name = destination.internal_name

    if (!destinationDefaultAsset
        || !sourceDefaultAsset
        || source_internal_name === destination_internal_name)
        return false

    const sourceASsetIsAvailable = source
        ?.currencies
        .some(c => c?.asset === asset)

    const destinationAssetIsAvailable = destination
        ?.currencies
        .some(c => c?.asset === asset)

    return sourceASsetIsAvailable && destinationAssetIsAvailable
}

export function FilterDestinationLayers(networks: CryptoNetwork[], source?: CryptoNetwork | null, lockedCurrency?: NetworkCurrency | null): CryptoNetwork[] {

    const IsAvailableForSomeLayer = (asset: string, destination: CryptoNetwork) =>
        networks.some(l => IsAvailableForLayer(asset, l, destination))

    const filteredLayers = networks.filter(l => {
        const isAvailable = source?.internal_name !== l.internal_name;

        const layerHasAvailableL2 = l.currencies?.some(l2Asset =>
            (!lockedCurrency || l2Asset?.asset === lockedCurrency?.asset)
            && (source ? IsAvailableForLayer(l2Asset.asset, source, l)
                : IsAvailableForSomeLayer(l2Asset.asset, l)))

        return isAvailable && layerHasAvailableL2
    })

    return filteredLayers;
}

export const getThemeData = async (query: any) => {
    try {
        if (!query)
            return null
        const theme_name = query.theme || query.appName || query.addressSource
        // const internalApiClient = new InternalApiClient()
        // const themeData = await internalApiClient.GetThemeData(theme_name);
        // result.themeData = themeData as ThemeData;
        return THEME_COLORS[theme_name] || null;
    }
    catch( e: any ) {
        console.log(e)
        return null
    }
}