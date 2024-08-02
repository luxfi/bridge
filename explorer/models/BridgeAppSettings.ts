import { CryptoNetwork, NetworkCurrency } from "./CryptoNetwork";
import { Exchange } from "./Exchange";
import { Layer } from "./Layer";
import { BridgeSettings } from "./BridgeSettings";

export class BridgeAppSettings {
  constructor(settings: BridgeSettings | any) {
    this.layers = BridgeAppSettings.ResolveLayers(settings.networks);
    this.exchanges = settings.exchanges;
  }

  exchanges: Exchange[];
  layers: Layer[];

  resolveImgSrc = (
    item:
      | Layer
      | NetworkCurrency
      | Pick<Layer, "internal_name">
      | { asset: string }
      | undefined
  ) => {
    if (!item) {
      return "/assets/img/logo_placeholder.png";
    }

    const resource_storage_url = process.env.NEXT_PUBLIC_RESOURCE_STORAGE_URL;
    if (!resource_storage_url)
      throw new Error(
        "NEXT_PUBLIC_RESOURCE_STORAGE_URL is not set up in env vars"
      );

    const basePath = new URL(resource_storage_url);

    // Shitty way to check for partner
    if ((item as any)?.internal_name != undefined) {
      basePath.pathname = `/bridge/networks/${(
        item as any
      )?.internal_name?.toLowerCase()}.png`;
    } else if ((item as any)?.asset != undefined) {
      basePath.pathname = `/bridge/currencies/${(
        item as any
      )?.asset?.toLowerCase()}.png`;
    }
    console.log("=====>", basePath.href);

    return basePath.href;
  };

  static ResolveLayers(networks: any[]): Layer[] {
    const resource_storage_url = process.env.NEXT_PUBLIC_RESOURCE_STORAGE_URL;
    if (!resource_storage_url)
      throw new Error(
        "NEXT_PUBLIC_RESOURCE_STORAGE_URL is not set up in env vars"
      );

    const basePath = new URL(resource_storage_url);

    const networkLayers: Layer[] = networks?.map(
      (n): Layer => ({
        isExchange: false,
        assets: BridgeAppSettings.ResolveNetworkL2Assets(n),
        img_url: `${basePath}bridge/networks/${n?.internal_name?.toLowerCase()}.png`,
        ...n,
      })
    );
    return networkLayers;
  }

  static ResolveNetworkL2Assets(network: CryptoNetwork): NetworkCurrency[] {
    return network?.currencies?.map((c) => ({
      asset: c.asset,
      status: c.status,
      contract_address: c.contract_address,
      decimals: c.decimals,
      precision: c.precision,
      price_in_usd: c.price_in_usd,
      is_native: c.is_native,
      is_refuel_enabled: c.is_refuel_enabled,
    }));
  }
}
