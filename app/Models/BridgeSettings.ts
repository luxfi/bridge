import { CryptoNetwork } from "./CryptoNetwork";
import { Currency } from "./Currency";
import { Exchange } from "./Exchange";

export type OauthProveider = {
  provider: string,
  oauth_connect_url: string,
  oauth_authorize_url: string
}

export type Discovery = {
  identity_url: string;
  resource_storage_url: string;
  o_auth_providers: OauthProveider[]
}

export interface BridgeSettings {
    exchanges: Exchange[]
    networks: CryptoNetwork[]
    currencies: Currency[]
    discovery: Discovery
    validSignatureisPresent?: boolean
};

