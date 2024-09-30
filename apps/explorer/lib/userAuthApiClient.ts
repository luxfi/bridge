import { AuthConnectResponse, AuthGetCodeResponse } from "@/models/BridgeAuth";
import axios from "axios";

export default class BridgeAuthApiClient {
    static identityBaseEndpoint: string;

    async getCodeAsync(email: string): Promise<AuthGetCodeResponse> {
        return await axios.post(BridgeAuthApiClient.identityBaseEndpoint + '/api/auth/get_code',
            { email },
            { headers: { 'Access-Control-Allow-Origin': '*' } })
            .then(res => res.data);
    }

    async connectAsync(email: string, code: string): Promise<AuthConnectResponse> {
        const params = new URLSearchParams();
        params.append('client_id', 'bridge_ui');
        params.append('grant_type', 'passwordless');
        params.append('email', email);
        params.append('code', code);

        return await axios.post(BridgeAuthApiClient.identityBaseEndpoint + '/connect/token', params, { headers: { 'Access-Control-Allow-Origin': '*' } }).then(res => res.data);
    }

    async guestConnectAsync(): Promise<AuthConnectResponse> {
        const params = new URLSearchParams();
        params.append('client_id', 'bridge_ui');
        params.append('grant_type', 'credentialless');

        return await axios.post(BridgeAuthApiClient.identityBaseEndpoint + '/connect/token', params, { headers: { 'Access-Control-Allow-Origin': '*' } }).then(res => res.data);
    }
}
