export default class AppSettings {
    static BridgeApiUri?: string = 'https://bridge-api.layerswap.io' //process.env.NEXT_PUBLIC_LS_BRIDGE_API;
    static ApiVersion: string = `${process.env.NEXT_PUBLIC_API_VERSION === 'mainnet' ? 'mainnet' : 'testnet'}`
    static ExplorerURl: string = `https://explore.bridge.lux${process.env.NEXT_PUBLIC_API_VERSION === 'mainnet' ? '' : '-test'}.network/`
}
