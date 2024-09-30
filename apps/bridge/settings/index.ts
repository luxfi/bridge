// Importing JSON files for mainnet
import mainnetCurrencies from "./mainnet/currencies.json";
import mainnetDiscovery from "./mainnet/discovery.json";
import mainnetExchanges from "./mainnet/exchanges.json";
import mainnetNetworks from "./mainnet/networks.json";
import mainnetSources from "./mainnet/sources.json";
import mainnetDestinations from "./mainnet/destinations.json";
import mainnetDepositContractAddress from "./testnet/deposit.json";
// Importing JSON files for testnet
import testnetCurrencies from "./testnet/currencies.json";
import testnetDiscovery from "./testnet/discovery.json";
import testnetExchanges from "./testnet/exchanges.json";
import testnetNetworks from "./testnet/networks.json";
import testnetSources from "./testnet/sources.json";
import testnetDestinations from "./testnet/destinations.json";
import testnetDepositContractAddress from "./testnet/deposit.json";

export const mainnetSettings = {
  data: {
    currencies: mainnetCurrencies,
    discovery: mainnetDiscovery,
    exchanges: mainnetExchanges,
    networks: mainnetNetworks,
  },
  sources: mainnetSources,
  destinations: mainnetDestinations,
  contractAddress: mainnetDepositContractAddress,
  error: null,
};

export const testnetSettings = {
  data: {
    currencies: testnetCurrencies,
    discovery: testnetDiscovery,
    exchanges: testnetExchanges,
    networks: testnetNetworks,
  },
  sources: testnetSources,
  destinations: testnetDestinations,
  contractAddress: testnetDepositContractAddress,
  error: null,
};

export const deposit_addresses: Record<string, string[]> = {
  "evm": [
    "0x9011E888251AB053B7bD1cdB598Db4f9DEd94714",
    "0xEAbCC110fAcBfebabC66Ad6f9E7B67288e720B59",
    "0x8d5081153aE1cfb41f5c932fe0b6Beb7E159cF84",
    "0xf8f12D0592e6d1bFe92ee16CaBCC4a6F26dAAe23",
    "0xFb66808f708e1d4D7D43a8c75596e84f94e06806",
    "0x313CF291c069C58D6bd61B0D672673462B8951bD",
    "0xf7f52257a6143cE6BbD12A98eF2B0a3d0C648079"
  ],
  "starknet": [
    "0x012087325194323197379425C8f9d8c642ab7990ea0F58AEd184E607a300C303"
  ],
  "solana": [
    "8zvZwdAx5bi2ngJsSS4ydEnNnLig9koTfrgNajQ55rQP",
    "81CXWf97V3YxrP9KjNbNcbRWPTMwBGoqXoC5ocMHLh5J",
    "6fsnT11Km4CMiLenUejVN52XuBC8uMJqc6EuobJ57dci",
    "9WuVkcCMAdfBcATFdPPPzCk2wPZ4NvBuTW71QN4NJvFv",
    "EY7GoniPUNP3ymBa22PmzjSB6yLSjhTgRbAj1ntQtTjq",
    "8nmeeZnSYuauNsrL6KTXEen65bR1ji3LxWRK2UrTo8Wg",
    "27nBpuhupcW6cEdxuYgEafzwMJqHrFQyJJC28jPyzdkP"
  ],
  "cosmos": [
    "cosmos15urq2dtp9qce4fyc85m6upwm9xul3049um7trd"
  ],
  "stark_ex": [
    "0x012087325194323197379425C8f9d8c642ab7990ea0F58AEd184E607a300C303"
  ],
  "zk_sync_lite": [
    "0x9011E888251AB053B7bD1cdB598Db4f9DEd94714",
    "0xEAbCC110fAcBfebabC66Ad6f9E7B67288e720B59",
    "0x8d5081153aE1cfb41f5c932fe0b6Beb7E159cF84",
    "0xf8f12D0592e6d1bFe92ee16CaBCC4a6F26dAAe23",
    "0xFb66808f708e1d4D7D43a8c75596e84f94e06806",
    "0x313CF291c069C58D6bd61B0D672673462B8951bD",
    "0xf7f52257a6143cE6BbD12A98eF2B0a3d0C648079"
  ],
  "TON": [
    "UQCgLTaepS5TB4RwZmWWUTPxhFWRsBVvxjhh1YLkWJ3aHa7u"
  ],
  "btc": [
    "3QohtVgzdg9kTbXiyPRYMTEe27xgDnFi4J",
    "31v7kkGKA2ZeNEC4hLGwWNLHyh9BCCfpvr",
    "3AboiJbpSAHvQgeWFZhSBV74fPMRyXm4Cz",
    "3LBrRA2C9Kr3C3nk7E36hNFTD9NUTTNL8o",
    "3L1d6jeciqZmh8FML89y9Qi5kURgVG7k8X",
    "3G8iPt7qSaNiviPWQTrCJa9W6k1hvahG5A"
  ]
}
