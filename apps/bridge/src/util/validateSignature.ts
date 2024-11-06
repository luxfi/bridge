import { enc, HmacSHA256 } from "crypto-js";
import { QueryParams } from "../Models/QueryParams";

export function validateSignature(searchParams: URLSearchParams): boolean {

  const timestamp = searchParams.get('timestamp')
  const signature = searchParams.get('signature')
  const appName = searchParams.get('appName')
  const apiKey = searchParams.get('apiKey')

    //One day
    const PERIOD_IN_MILISECONDS = 86400000
    if (!timestamp || !signature || Number(timestamp) < new Date().getTime() - PERIOD_IN_MILISECONDS) {
      return false
    }

    const secret = JSON.parse(process.env.PARTNER_SECRETS || "{}")?.[appName || '']?.[apiKey || ""]
    if (!secret) {
      return false
    }

    searchParams.delete('signature')
    const dataToSign = formatParams(searchParams);
    const sig = hmac(dataToSign, secret);
    return (sig === signature)
}

export const formatParams = (searchParams: URLSearchParams) => {

    // Sort params by key
  searchParams.sort();

    // Lowercase all the keys and join key and value "key1=value1&key2=value2&..."
  return searchParams.toString();
}

const hmac = (data: string, secret: any) => (
    // Compute the signature as a HEX encoded HMAC with SHA-256 and your Secret Key
  enc.Hex.stringify(HmacSHA256(data.toString(), secret))
)