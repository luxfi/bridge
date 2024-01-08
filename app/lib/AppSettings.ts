export default class AppSettings {
    static BridgeApiUri?: string = process.env.NEXT_PUBLIC_BRIDGE_API
    static ApiVersion: string = `${process.env.NEXT_PUBLIC_API_VERSION === 'mainnet' ? 'mainnet' : 'testnet'}`
    static ExplorerURL: string = `https://explore.bridge.lux${process.env.NEXT_PUBLIC_API_VERSION === 'mainnet' ? '' : '-test'}.network/`
}
