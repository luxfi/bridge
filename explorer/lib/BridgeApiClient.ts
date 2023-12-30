import { ApiResponse } from "@/models/ApiResponse";
import AppSettings from "./AppSettings";
import { BridgeSettings } from "@/models/BridgeSettings";
import axios from "axios";


export default class BridgeApiClient {
    static apiBaseEndpoint: string | undefined = AppSettings.BridgeApiUri;

    async GetSettingsAsync(): Promise<ApiResponse<BridgeSettings>> {
        const fetcher = (url: string) => fetch(url).then(r => r.json())
        const version = process.env.NEXT_PUBLIC_API_VERSION
        return await fetcher(`${BridgeApiClient.apiBaseEndpoint}/api/settings?version=${version}`)
    }
}

export type CreateSwapParams = {
    amount: string,
    source: string,
    destination: string,
    asset: string,
    source_address: string,
    destination_address: string,
    app_name?: string,
    reference_id?: string,
    refuel?: boolean,
}
