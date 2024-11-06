import type { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import axios from 'axios'

import { validateSignature } from '@/util/validateSignature';
import { parseJwt } from '@/lib/jwtParser';
import BridgeApiClient from '@/lib/BridgeApiClient';
import { type AuthConnectResponse } from '@/Models/BridgeAuth';

export async function GET (req: NextRequest) {

    const headersList = headers()
    const authorization = headersList.get('authorization')
    const user_token = authorization?.split(" ")?.[1]

    const searchParams = req.nextUrl.searchParams
    const appName = searchParams.get('appName')!
    
    if (!user_token) {
      return new Response(null, {status: 401, statusText: "User not authenticated"})
    }

    const signatureIsValid = validateSignature(searchParams)
    if (!signatureIsValid) {
      return new Response(null, {status: 500, statusText: "Not valid signature"})
    }
    if (appName === "imxMarketplace") {
      try {
        const auth = await getAccessToken();
        const { sub } = parseJwt(user_token) || {}
        await verifyWallet(searchParams, sub, auth.access_token)
        return Response.json({ status: 'ok' }, {status: 200, statusText: "ok"})
      }
      catch (e: any) {
        return Response.json({ error: e?.response?.data?.error ?? "error"}, {status: 500, statusText: e?.response?.data?.error ?? "error"})
      }
    }
    else {
      return Response.json({ error: "error"}, {status: 500})
    }
}

const getAccessToken = async (): Promise<AuthConnectResponse> => {
    const params = new URLSearchParams();
    params.append('client_id', 'bridge_internal');
    params.append('grant_type', 'client_credentials');
    params.append('client_secret', process.env.INTERNAL_API_SECRET || "");
    const identity_url = process.env.NEXT_PUBLIC_IDENTITY_API
    const auth = axios.post<AuthConnectResponse>(`${identity_url}/connect/token`, params, { headers: { 'content-type': 'application/x-www-form-urlencoded' } })

    return (await auth).data;
}

const verifyWallet = async (searchParams: URLSearchParams, user_id: string, access_token: string) => {

    const data = {
      "address": searchParams.get('destAddress'),
      "network": searchParams.get('destNetwork'),
      "user_id": user_id
    }
    const res = axios.post<AuthConnectResponse>(`${BridgeApiClient.apiBaseEndpoint}/api/internal/whitelisted_addresses`, data, { headers: { "Content-Type": "application/json", "Authorization": 'Bearer ' + access_token } })
    return (await res).data;
}