export default class AppSettings {
    static BridgeApiUri: string | undefined = process.env.NEXT_PUBLIC_BRIDGE_API;
    static ApiVersion: string = process.env.NEXT_PUBLIC_API_VERSION || 'mainnet';
}
