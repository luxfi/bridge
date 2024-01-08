import { ApiResponse } from "@/models/ApiResponse";
import AppSettings from "./AppSettings";
import axios from "axios";
import { Exchange } from "@/models/Exchange";
import { CryptoNetwork } from "@/models/CryptoNetwork";

export default class BridgeApiClient {
    static apiBaseEndpoint: string | undefined = AppSettings.BridgeApiUri;
    static apiVersion: string = AppSettings.ApiVersion;

    async GetExchangesAsync(): Promise<ApiResponse<Exchange[]>> {
        return await axios.get(`${BridgeApiClient.apiBaseEndpoint}/api/exchanges?version=${BridgeApiClient.apiVersion}`).then(res => res.data);
    }

    async GetLSNetworksAsync(): Promise<ApiResponse<CryptoNetwork[]>> {
        return await axios.get(`${BridgeApiClient.apiBaseEndpoint}/api/networks?version=${BridgeApiClient.apiVersion}`).then(res => res.data);
    }
}