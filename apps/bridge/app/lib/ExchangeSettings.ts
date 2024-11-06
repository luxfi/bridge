import KnownInternalNames from "./knownIds";

const destinationOrder = [
    KnownInternalNames.Exchanges.Okex,
    KnownInternalNames.Exchanges.Binance,
    KnownInternalNames.Exchanges.Coinbase,
    KnownInternalNames.Exchanges.Kucoin,
    KnownInternalNames.Exchanges.Kraken,
    KnownInternalNames.Exchanges.MexcGlobal,
    KnownInternalNames.Exchanges.BinanceUS,
    KnownInternalNames.Exchanges.Huobi,
    KnownInternalNames.Exchanges.Gateio,
];

const sourceOrder = [
    KnownInternalNames.Exchanges.Okex,
    KnownInternalNames.Exchanges.Binance,
    KnownInternalNames.Exchanges.Coinbase,
    KnownInternalNames.Exchanges.Kucoin,
    KnownInternalNames.Exchanges.Kraken,
    KnownInternalNames.Exchanges.MexcGlobal,
    KnownInternalNames.Exchanges.BinanceUS,
    KnownInternalNames.Exchanges.Huobi,
    KnownInternalNames.Exchanges.Gateio,
];

export default class ExchangeSettings {
    CustomAuthorizationFlow?: "o_auth2" | "api_credentials";
    ExchangeWithdrawalPageUrl?: string;
    ExchangeApiKeyPageUrl?: string;
    ExchangeWithdrawalGuideUrl?: string;
    UserApiKeyGuideUrl?: string;
    UserWithdrawalGuideUrl?: string;
    AuthorizationNote?: string;
    WithdrawalWarningMessage?: string;
    KeyphraseDisplayName?: string;
    EstimatedTransferTime?: number;
    OrderInDestination?: number;
    OrderInSource?: number;
    EnableDepositAddressConnect?: boolean;

    public static KnownSettings: { [key: string]: ExchangeSettings } = {};
    public static ForceDisable?: { [exchange: string]: { offramp: boolean, onramp: boolean } }

    private static _isInitialized = false;
    public static Initialize() {
        if (ExchangeSettings._isInitialized) {
            return;
        }

        ExchangeSettings._isInitialized = true;
        ExchangeSettings.ForceDisable = JSON.parse(process.env.NEXT_PUBLIC_EXCHANGE_FORCE_SETTINGS || "{}")

        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Binance] = {
            EnableDepositAddressConnect: true,
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/binance",
            ExchangeApiKeyPageUrl: "https://www.binance.com/en/my/settings/api-management",
            ExchangeWithdrawalPageUrl: "https://www.binance.com/en/my/wallet/account/main/withdrawal/crypto",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/binance",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.BinanceUS] = {
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Bitfinex] = {
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/bitfinex",
            ExchangeApiKeyPageUrl: "https://setting.bitfinex.com/api",
            ExchangeWithdrawalPageUrl: "https://movement.bitfinex.com/withdraw",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/bitfinex",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Bittrex] = {
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/bittrex-global",
            ExchangeApiKeyPageUrl: "https://global.bittrex.com/Manage?view=api",
            ExchangeWithdrawalPageUrl: "https://global.bittrex.com/balance",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/bittrex-global",

        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Blocktane] = {
            ExchangeApiKeyPageUrl: "https://trade.blocktane.io/account/security/api-keys",
            ExchangeWithdrawalPageUrl: "https://trade.blocktane.io/account/wallets",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Coinbase] = {
            EnableDepositAddressConnect: true,
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/your-first-swap/on-ramp/withdraw-from-coinbase",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.CryptoCom] = {
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/crypto.com",
            ExchangeApiKeyPageUrl: "https://crypto.com/exchange/user/settings/api-management",
            ExchangeWithdrawalPageUrl: "https://crypto.com/exchange/",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Lux] = {
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/lux.exchange",
            ExchangeApiKeyPageUrl: "https://lux.exchange/settings/api",
            ExchangeWithdrawalPageUrl: "https://lux.exchange/wallet",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/lux.exchange",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Huobi] = {
            ExchangeApiKeyPageUrl: "https://www.huobi.com/en-us/apikey/",
            ExchangeWithdrawalPageUrl: "https://www.huobi.com/en-us/finance/withdraw",
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/huobi-global",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/huobi-global",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Kraken] = {
            AuthorizationNote: "When generating the API keys, make sure that the 'Query Ledger Entries' key permission is checked.",
            ExchangeWithdrawalPageUrl: "https://www.kraken.com/u/funding/withdraw",
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/kraken",
            ExchangeApiKeyPageUrl: "https://www.kraken.com/u/security/api",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/kraken",

        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Kucoin] = {
            ExchangeWithdrawalPageUrl: "https://www.kucoin.com/assets/withdraw",
            ExchangeApiKeyPageUrl: "https://www.kucoin.com/account/api",
            KeyphraseDisplayName: "Passphrase",
            CustomAuthorizationFlow: "api_credentials",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/kucoin",
        };
        ExchangeSettings.KnownSettings[KnownInternalNames.Exchanges.Okex] = {
            UserApiKeyGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/getting-api-keys/okx",
            KeyphraseDisplayName: "Passphrase",
            ExchangeApiKeyPageUrl: "https://www.okx.com/account/my-api",
            ExchangeWithdrawalPageUrl: "https://www.okx.com/balance/withdrawal",
            ExchangeWithdrawalGuideUrl: "https://docs.bridge.lux.network/user-docs/using-bridge/withdrawals/okx",
        };

        for (var k in ExchangeSettings.KnownSettings) {
            let setting = ExchangeSettings.KnownSettings[k];
            if (setting) {
                let destOrder = destinationOrder.indexOf(k);
                let srcOrder = sourceOrder.indexOf(k);

                setting.OrderInDestination = destOrder < 0 ? 10000 : destOrder;
                setting.OrderInSource = srcOrder < 0 ? 10000 : srcOrder;
            }
        }
    }
}

ExchangeSettings.Initialize();
