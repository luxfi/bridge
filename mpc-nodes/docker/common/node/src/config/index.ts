export const settings = {
  Vault: "0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e",
  RPC: {
    11155111: "https://sepolia.infura.io/v3/2e58a899d3c64eccb6955c2f33fc8a88",
    1: "https://lb.drpc.org/ogrpc?network=ethereum&dkey=AqFR4xsp40v0ugTBeYcYdFLf2rXfQTYR76p2UgWAgP__",
    7777: "https://api.lux.network"
  },
  LETH: {
    Ethereum: "",
    Sepolia: "",
    Lux: "0x42449554b0c7D85EbD488e14D7D48c6A78D3F9Be"
  },
  LUSD: {
    Ethereum: "",
    Sepolia: "",
    Lux: "0xc16ECFE3cB80e142d7110b97a442d4caAA203ABf"
  },
  Teleporter: {
    Ethereum: "",
    Sepolia: "0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e",
    Lux: "0xB2237fb7DBB19Ff09BBD64029064eC05B3C369Ac"
  },
  USDT: {
    Ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    Sepolia: "0xa92e09451140d645a2fe262c9631dd808439dded"
  },
  USDC: {
    Ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    Sepolia: "0xB587bAb3d507d720625D30544C2889D661446BF7"
  },
  DAI: {
    Ethereum: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    Sepolia: "0x7390C3FA8576a0E9E7c788cc7955c3151c4c1612"
  },
  ETH: {
    Ethereum: "0x0000000000000000000000000000000000000000",
    Sepolia: "0x0000000000000000000000000000000000000000"
  },
  NetNames: {
    "11155111": "Sepolia",
    "1": "Ethereum",
    "7777": "Lux"
  },
  DECIMALS: {
    ETH: "18",
    USDT: "6",
    USDC: "6",
    DAI: "18"
  },
  Msg: "Sign to prove you are initiator of transaction.",
  DupeListLimit: "200",
  SMTimeout: "1",
  NewSigAllowed: false,
  KeyStore: "keys.store"
}

export const swapMappings: Record<string, string[] | undefined> = {
  // LETH swap available tokens (native ETH or wrapped ETH)
  "0x42449554b0c7D85EbD488e14D7D48c6A78D3F9Be": ["ETH", "WETH"],
  // LUSD swap available tokens (stable coins)
  "0xc16ECFE3cB80e142d7110b97a442d4caAA203ABf": ["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP", "HUSD", "SUSD", "USDN"]
}
