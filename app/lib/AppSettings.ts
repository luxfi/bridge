export default class AppSettings {
    static BridgeApiUri?: string = process.env.NEXT_PUBLIC_LS_BRIDGE_API;
    static ApiVersion: string = process.env.NEXT_PUBLIC_API_VERSION || 'mainnet';
    static ExplorerURl: string = `https://bridge.lux.network/${process.env.NEXT_PUBLIC_API_VERSION === 'sandbox' ? 'testnet/' : ''}explorer`
}

