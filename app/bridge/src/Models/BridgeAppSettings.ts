import type { Exchange } from "./Exchange";
import type { BridgeSettings, Route } from "@/Models/BridgeSettings";
import type { CryptoNetwork, NetworkCurrency } from "./CryptoNetwork";

export class BridgeAppSettings {

  exchanges: Exchange[];
  networks: CryptoNetwork[];
  sourceRoutes: Route[];
  destinationRoutes: Route[];


  constructor(settings: BridgeSettings | any) {
    // this.layers = BridgeAppSettings.ResolveLayers(
    //   settings.networks,
    //   settings.sourceRoutes,
    //   settings.destinationRoutes
    // );
    this.networks = settings.networks
    this.exchanges = settings.exchanges;
    this.sourceRoutes = settings.sourceRoutes;
    this.destinationRoutes = settings.destinationRoutes;
  }

  

  /**
   * get NetworkCurrency asset from exchange asset data
   * @param layers
   * @param exchange
   * @param asset
   * @returns
   */
  getExchangeAsset = (
    networks: CryptoNetwork[],
    exchange?: Exchange,
    asset?: string
  ): NetworkCurrency | undefined => {
    if (!exchange || !asset) {
      return undefined;
    } else {
      const currency = exchange?.currencies?.find((c) => c.asset === asset);
      const network = networks.find((n) => n.internal_name === currency?.network);
      return network?.currencies?.find((a) => a?.asset === asset);
    }
  };
  /**
   * get Network from Exchange and Asset
   * @param layers
   * @param exchange
   * @param asset
   * @returns
   */
  getExchangeNetwork = (
    networks: CryptoNetwork[],
    exchange?: Exchange,
    asset?: string
  ): CryptoNetwork | undefined => {
    if (!exchange || !asset) {
      return undefined;
    } else {
      const currency = exchange?.currencies?.find((c) => c.asset === asset);
      const network = networks.find((n) => n.internal_name === currency?.network);
      return network;
    }
  };

  getTransactionExplorerTemplate = (
    networks: CryptoNetwork[],
    network?: CryptoNetwork,
    exchange?: Exchange,
    asset?: string
  ): string | undefined => {
    if (network) {
      return network?.transaction_explorer_template;
    } else {
      const currency = exchange?.currencies?.find((c) => c.asset === asset);
      return networks.find((n) => n.internal_name === currency?.network)
        ?.transaction_explorer_template;
    }
  };

  // static ResolveLayers(
  //   networks: CryptoNetwork[],
  //   sourceRoutes: Route[],
  //   destinationRoutes: Route[]
  // ): Layer[] {
  //   const resource_storage_url = process.env.NEXT_PUBLIC_RESOURCE_STORAGE_URL;
  //   if (!resource_storage_url)
  //     throw new Error(
  //       "NEXT_PUBLIC_RESOURCE_STORAGE_URL is not set up in env vars"
  //     );

  //   const basePath = new URL(resource_storage_url);
  //   const networkLayers: Layer[] = networks?.map(
  //     (n): Layer => ({
  //       assets: BridgeAppSettings.ResolveNetworkL2Assets(
  //         n,
  //         sourceRoutes,
  //         destinationRoutes
  //       ),
  //       logo: `${
  //         process.env.NEXT_PUBLIC_CDN_URL
  //       }/bridge/networks/${n?.internal_name?.toLowerCase()}.png`,
  //       ...n,
  //     })
  //   );
  //   return networkLayers;
  // }

  // static ResolveNetworkL2Assets(
  //   network: CryptoNetwork,
  //   sourceRoutes: Route[],
  //   destinationRoutes: Route[]
  // ): NetworkCurrency[] {
  //   return network?.currencies?.map((c) => {
  //     const is_deposit_enabled = sourceRoutes?.some(
  //       (r) => r.asset === c.asset && r.network === network.internal_name
  //     );
  //     const is_withdrawal_enabled = destinationRoutes?.some(
  //       (r) => r.asset === c.asset && r.network === network.internal_name
  //     );

  //     return {
  //       asset: c.asset,
  //       contract_address: c.contract_address,
  //       decimals: c.decimals,
  //       precision: c.precision,
  //       price_in_usd: c.price_in_usd,
  //       is_native: c.is_native,
  //       is_refuel_enabled: c.is_refuel_enabled,
  //       is_deposit_enabled,
  //       is_withdrawal_enabled,
  //     };
  //   });
  // }
}
