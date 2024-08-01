import { CryptoNetwork, NetworkCurrency } from "./CryptoNetwork";
import { Exchange } from "./Exchange";
import { Layer } from "./Layer";
import { BridgeSettings, Route } from "./BridgeSettings";
import { Partner } from "./Partner";

export class BridgeAppSettings {
    constructor(settings: BridgeSettings | any) {
        this.layers = BridgeAppSettings.ResolveLayers(settings.networks, settings.sourceRoutes, settings.destinationRoutes);
        this.exchanges = settings.exchanges
        this.sourceRoutes = settings.sourceRoutes
        this.destinationRoutes = settings.destinationRoutes
    }

    exchanges: Exchange[]
    layers: Layer[]
    sourceRoutes: Route[]
    destinationRoutes: Route[]

    resolveImgSrc = (item: Layer | NetworkCurrency | Exchange | Pick<Layer, 'internal_name'> | { asset: string } | Partner | undefined) => {

        if (!item) {
            return "/assets/img/logo_placeholder.png";
        }

        const resource_storage_url = process.env.NEXT_PUBLIC_RESOURCE_STORAGE_URL
        if (!resource_storage_url)
            throw new Error("NEXT_PUBLIC_RESOURCE_STORAGE_URL is not set up in env vars")

        const basePath = new URL(resource_storage_url);

        // Shitty way to check for partner
        if ((item as Partner).is_wallet != undefined) {
            return (item as Partner)?.logo_url;
        }
        else if ((item as any)?.internal_name != undefined) {
            // basePath.pathname = `/layerswap/networks/${(item as any)?.internal_name?.toLowerCase()}.png`;
            return `${process.env.NEXT_PUBLIC_CDN_URL}/bridge/networks/${(item as any)?.internal_name?.toLowerCase()}.png`;
        }
        else if ((item as any)?.asset != undefined) {
            // basePath.pathname = `/layerswap/currencies/${(item as any)?.asset?.toLowerCase()}.png`;
            return `${process.env.NEXT_PUBLIC_CDN_URL}/bridge/currencies/${(item as any)?.asset?.toLowerCase()}.png`;
        }

        return basePath.href;
    }
    /**
     * get NetworkCurrency asset from exchange asset data
     * @param layers 
     * @param exchange 
     * @param asset 
     * @returns 
     */
    getExchangeAsset = (layers: Layer[], exchange?: Exchange, asset?: string): NetworkCurrency | undefined => {
        if (!exchange || !asset) {
            return undefined;
        } else {
            const currency = exchange?.currencies?.find(c => c.asset === asset);
            const layer = layers.find(n => n.internal_name === currency?.network);
            return layer?.assets?.find(a => a?.asset === asset)
        }
    }
    /**
     * get Network from Exchange and Asset
     * @param layers 
     * @param exchange 
     * @param asset 
     * @returns 
     */
    getExchangeNetwork = (layers: Layer[], exchange?: Exchange, asset?: string): Layer | undefined => {
        if (!exchange || !asset) {
            return undefined;
        } else {
            const currency = exchange?.currencies?.find(c => c.asset === asset);
            const layer = layers.find(n => n.internal_name === currency?.network);
            return layer;
        }
    }

    getTransactionExplorerTemplate = (layers: Layer[], layer?: Layer, exchange?: Exchange, asset?: string): string | undefined => {
        if (layer) {
            return layer?.transaction_explorer_template;
        } else {
            const currency = exchange?.currencies?.find(c => c.asset === asset);
            return layers.find(n => n.internal_name === currency?.network)?.transaction_explorer_template;
        }
    }

    static ResolveLayers(networks: CryptoNetwork[], sourceRoutes: Route[], destinationRoutes: Route[]): Layer[] {
        const resource_storage_url = process.env.NEXT_PUBLIC_RESOURCE_STORAGE_URL
        if (!resource_storage_url)
            throw new Error("NEXT_PUBLIC_RESOURCE_STORAGE_URL is not set up in env vars")

        const basePath = new URL(resource_storage_url);
        const networkLayers: Layer[] = networks?.map((n): Layer =>
        ({
            assets: BridgeAppSettings.ResolveNetworkL2Assets(n, sourceRoutes, destinationRoutes),
            // img_url: `${basePath}layerswap/networks/${n?.internal_name?.toLowerCase()}.png`,
            img_url: `${process.env.NEXT_PUBLIC_CDN_URL}/bridge/networks/${n?.internal_name?.toLowerCase()}.png`,
            ...n,
        }))
        return networkLayers
    }

    static ResolveNetworkL2Assets(network: CryptoNetwork, sourceRoutes: Route[], destinationRoutes: Route[]): NetworkCurrency[] {
        return network?.currencies?.map(c => {
            const availableInSource = sourceRoutes?.some(r => r.asset === c.asset && r.network === network.internal_name)
            const availableInDestination = destinationRoutes?.some(r => r.asset === c.asset && r.network === network.internal_name)

            return ({
                asset: c.asset,
                contract_address: c.contract_address,
                decimals: c.decimals,
                precision: c.precision,
                price_in_usd: c.price_in_usd,
                is_native: c.is_native,
                is_refuel_enabled: c.is_refuel_enabled,
                availableInSource,
                availableInDestination,
            })
        })
    }
}