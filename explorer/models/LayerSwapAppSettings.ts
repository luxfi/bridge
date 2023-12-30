import { CryptoNetwork, NetworkCurrency } from "./CryptoNetwork";
import { Currency } from "./Currency";
import { Exchange, ExchangeCurrency } from "./Exchange";
import { BaseL2Asset, ExchangeL2Asset, Layer } from "./Layer";
import { BridgeSettings } from "./BridgeSettings";

export class BridgeAppSettings extends BridgeSettings {
    constructor(settings?: BridgeSettings) {
        super();
        Object.assign(this, settings)

        this.layers = BridgeAppSettings.ResolveLayers(this.exchanges || [], this.networks || []);
    }


    layers?: Layer[]

    resolveImgSrc = (item: Layer | undefined | Currency | Pick<Layer, 'internal_name'> | { asset: string }) => {
        if (!item) {
            return "/images/logo_placeholder.png";
        }
        // Shitty way to check for partner
        else if ((item as any)?.internal_name != undefined) {
            return `${this?.discovery?.resource_storage_url}luxdefi/networks/${(item as any)?.internal_name?.toLowerCase()}.png`;
        }
        else if ((item as any)?.asset != undefined) {
            return `${this?.discovery?.resource_storage_url}luxdefi/currencies/${(item as any)?.asset?.toLowerCase()}.png`;
        }
    }

    static ResolveLayers(exchanges: Exchange[], networks: CryptoNetwork[]): Layer[] {
        const exchangeLayers: Layer[] = exchanges.map((e): Layer => ({
            isExchange: true,
            internal_name: e.internal_name,
            display_name: e.display_name,
            status: e.status || "inactive",
            authorization_flow: e.authorization_flow || "none",
            type: e.type || "cex",
            assets: BridgeAppSettings.ResolveExchangeL2Assets(e.currencies || [], networks)
        }))
        const networkLayers: Layer[] = networks.map((n): Layer =>
        ({
            isExchange: false,
            internal_name: n.internal_name || '',
            display_name: n.display_name || '',
            status: n.status || "inactive",
            native_currency: n.native_currency,
            average_completion_time: n.average_completion_time,
            chain_id: n.chain_id,
            address_type: n.address_type,
            assets: BridgeAppSettings.ResolveNetworkL2Assets(n)
        }))
        const result = exchangeLayers.concat(networkLayers)
        return result
    }

    static ResolveExchangeL2Assets(
        currencies: ExchangeCurrency[],
        networks: CryptoNetwork[]): ExchangeL2Asset[] {
        return currencies?.map(exchangecurrency => {
            const network = networks.find(n => n.internal_name === exchangecurrency.network) as CryptoNetwork;
            const networkCurrencies = network?.currencies?.find(nc => nc.asset === exchangecurrency.asset) as NetworkCurrency
            return {
                asset: exchangecurrency.asset,
                status: exchangecurrency.status,
                is_default: exchangecurrency.is_default,
                network_internal_name: exchangecurrency.network,
                network: { ...network, currencies: [networkCurrencies] },
                min_deposit_amount: exchangecurrency.min_deposit_amount,
                withdrawal_fee: exchangecurrency.withdrawal_fee,
            }
        }) || []
    }


    static ResolveNetworkL2Assets(network: CryptoNetwork): BaseL2Asset[] {
        return network?.currencies?.map(c => ({
            asset: c.asset,
            status: c.status,
            is_default: true,
            network_internal_name: network?.internal_name,
            network: { ...network, currencies: [c] },
            contract_address: c.contract_address,
            decimals: c.decimals
        })) || []
    }
}