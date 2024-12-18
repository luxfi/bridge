// import type { Exchange } from "./Exchange";
import type { BridgeSettings } from "@/types/bridge-settings";
import type { CryptoNetwork } from "./crypto-network";

export class BridgeAppSettings {

  // exchanges: Exchange[];
  networks: CryptoNetwork[];
  // sourceRoutes: Route[];
  // destinationRoutes: Route[];


  constructor(settings: BridgeSettings | any) {
    this.networks = settings.networks
    // this.exchanges = settings.exchanges;
    // this.sourceRoutes = settings.sourceRoutes;
    // this.destinationRoutes = settings.destinationRoutes;
  }

}