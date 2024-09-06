import { CryptoNetwork } from "./CryptoNetwork";
import { Exchange } from "./Exchange";

export class BridgeSettings {
    exchanges: Exchange[];
    networks: CryptoNetwork[];
    sources?: Route[];
    destinations?: Route[];
};

export class Route {
    network: string;
    asset: string;
}