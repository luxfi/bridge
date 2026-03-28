export default class AppSettings {
    static BridgeApiUri?: string = process.env.NEXT_PUBLIC_BRIDGE_API;
    static ApiVersion: string = process.env.NEXT_PUBLIC_API_VERSION || 'mainnet';
    static ExplorerURl: string = process.env.NEXT_PUBLIC_EXPLORER_URL || process.env.BRIDGE_EXPLORER_URL || ''
}
