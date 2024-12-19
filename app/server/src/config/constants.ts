import { UTILA_NETWORK } from "@/types/utila"

export default class KnownInternalNames {
  static Exchanges = class {
    public static readonly Coinbase: string = "COINBASE"

    public static readonly Coinspot: string = "COINSPOT"

    public static readonly Gateio: string = "GATEIO"

    public static readonly Binance: string = "BINANCE"

    public static readonly Kucoin: string = "KUCOIN"

    public static readonly Huobi: string = "HUOBI"

    public static readonly LuxUSA: string = "LUXUSA"

    public static readonly Lux: string = "LUX"

    public static readonly Okex: string = "OKEX"

    public static readonly Bitfinex: string = "BITFINEX"

    public static readonly Kraken: string = "KRAKEN"

    public static readonly Bittrex: string = "BITTREX"

    public static readonly CryptoCom: string = "CRYPTOCOM"

    public static readonly CryptoComApp: string = "CRYPTOCOMAPP"

    public static readonly BinanceUS: string = "BINANCEUS"

    public static readonly Blocktane: string = "BLOCKTANE"

    public static readonly MexcGlobal: string = "MEXC"
  }

  static Networks = class {
    public static readonly CronosMainnet: string = "CRONOS_MAINNET"

    public static readonly OsmosisMainnet: string = "OSMOSIS_MAINNET"

    public static readonly ArbitrumMainnet: string = "ARBITRUM_MAINNET"

    public static readonly ArbitrumNova: string = "ARBITRUMNOVA_MAINNET"

    public static readonly ArbitrumRinkeby: string = "ARBITRUM_RINKEBY"

    public static readonly ArbitrumGoerli: string = "ARBITRUM_GOERLI"

    public static readonly OptimismMainnet: string = "OPTIMISM_MAINNET"

    public static readonly OptimismGoerli: string = "OPTIMISM_GOERLI"

    public static readonly OptimismKovan: string = "OPTIMISM_KOVAN"

    public static readonly RoninMainnet: string = "RONIN_MAINNET"

    public static readonly BobaMainnet: string = "BOBA_MAINNET"

    public static readonly BobaRinkeby: string = "BOBA_RINKEBY"

    public static readonly ZksyncMainnet: string = "ZKSYNC_MAINNET"

    public static readonly ZksyncEraMainnet: string = "ZKSYNCERA_MAINNET"

    public static readonly ZkspaceMainnet: string = "ZKSPACE_MAINNET"

    public static readonly ZksyncRinkeby: string = "ZKSYNC_RINKEBY"

    public static readonly EthereumRinkeby: string = "ETHEREUM_RINKEBY"

    public static readonly EthereumMainnet: string = "ETHEREUM_MAINNET"

    public static readonly EthereumGoerli: string = "ETHEREUM_GOERLI"

    public static readonly PolygonMainnet: string = "POLYGON_MAINNET"

    public static readonly LoopringMainnet: string = "LOOPRING_MAINNET"

    public static readonly LoopringGoerli: string = "LOOPRING_GOERLI"

    public static readonly MoonbeamMainnet: string = "MOONBEAM_MAINNET"

    public static readonly StarkNetGoerli: string = "STARKNET_GOERLI"

    public static readonly StarkNetMainnet: string = "STARKNET_MAINNET"

    public static readonly ImmutableXMainnet: string = "IMMUTABLEX_MAINNET"

    public static readonly ImmutableXGoerli: string = "IMMUTABLEX_GOERLI"

    public static readonly AstarMainnet: string = "ASTAR_MAINNET"

    public static readonly NahmiiMainnet: string = "NAHMII_MAINNET"

    public static readonly RhinoFiMainnet: string = "RHINOFI_MAINNET"

    public static readonly DydxMainnet: string = "DYDX_MAINNET"

    public static readonly DydxGoerli: string = "DYDX_GOERLI"

    public static readonly BNBChainMainnet: string = "BSC_MAINNET"

    public static readonly SolanaMainnet: string = "SOLANA_MAINNET"

    public static readonly SolanaTestnet: string = "SOLANA_TESTNET"

    public static readonly SolanaDevnet: string = "SOLANA_DEVNET"

    public static readonly SorareStage: string = "SORARE_MAINNET"

    public static readonly KCCMainnet: string = "KCC_MAINNET"

    public static readonly OKCMainnet: string = "OKC_MAINNET"

    public static readonly PolygonZkMainnet: string = "POLYGONZK_MAINNET"

    public static readonly LineaMainnet: string = "LINEA_MAINNET"

    public static readonly BaseMainnet: string = "BASE_MAINNET"

    public static readonly BaseTestnet: string = "BASE_TESTNET"

    public static readonly AvalancheMainnet: string = "AVAX_MAINNET"

    public static readonly PGNMainnet: string = "PGN_MAINNET"

    public static readonly PGNTestnet: string = "PGN_TESTNET"

    public static readonly MantleMainnet: string = "MANTLE_MAINNET"

    public static readonly ZoraMainnet: string = "ZORA_MAINNET"

    public static readonly RolluxMainnet: string = "ROLLUX_MAINNET"

    public static readonly OpBNBMainnet: string = "OPBNB_MAINNET"

    public static readonly MantaMainnet: string = "MANTA_MAINNET"

    public static readonly ScrollMainnet: string = "SCROLL_MAINNET"

    public static readonly TONMainnet: string = "TON_MAINNET"

    public static readonly BrineMainnet: string = "BRINE_MAINNET"
  }

  static Currencies = class {
    public static readonly USDT: string = "USDT"
    public static readonly ETH: string = "ETH"
    public static readonly USDC: string = "USDC"
    public static readonly LRC: string = "LRC"
    public static readonly IMX: string = "IMX"
    public static readonly SNX: string = "SNX"
    public static readonly ZKS: string = "ZKS"
  }

  static LiquidityProviders = class {
    public static readonly ConnextId: string = "39BF4D10-0AF8-4F54-A8B1-4C69A81ACA14".toLowerCase()

    public static readonly BridgeId: string = "168D5457-05ED-46E3-AAB3-72A2D2098F0F".toLowerCase()

    public static readonly StarkNetId: string = "fa3f93eb-9fea-44f3-a8a6-a5ced0f6d646".toLowerCase()
  }
}

export const UTILA_NETWORKS: Record<string, UTILA_NETWORK> = {
  'BITCOIN_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/bitcoin-mainnet",
    displayName: "Bitcoin",
    testnet: false,
    nativeAsset: "assets/native.bitcoin-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "bip122:000000000019d6689c085ae165831e93",
      namespace: "bip122",
      reference: "000000000019d6689c085ae165831e93"
    },
    assets: {
      "BTC": "assets/native.bitcoin-mainnet"
    }
  },
  'BITCOIN_TESTNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/bitcoin-testnet",
    displayName: "Bitcoin Testnet",
    testnet: true,
    nativeAsset: "assets/native.bitcoin-testnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "bip122:000000000933ea01ad0ee984209779ba",
      namespace: "bip122",
      reference: "000000000933ea01ad0ee984209779ba"
    },
    assets: {
      "BTC": "assets/native.bitcoin-testnet"
    }
  },
  'ETHEREUM_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/ethereum-mainnet",
    displayName: "Ethereum",
    testnet: false,
    nativeAsset: "assets/native.ethereum-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:1",
      namespace: "eip155",
      reference: "1"
    },
    assets: {
      "ETH": "assets/native.ethereum-mainnet"
    }
  },
  'ETHEREUM_GOERLI': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/ethereum-testnet-goerli",
    displayName: "Ethereum Goerli Testnet",
    testnet: true,
    nativeAsset: "assets/native.ethereum-testnet-goerli",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:5",
      namespace: "eip155",
      reference: "5"
    },
    assets: {
      "ETH": "assets/native.ethereum-testnet-goerli"
    }
  },
  'ETHEREUM_SEPOLIA': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/ethereum-testnet-sepolia",
    displayName: "Ethereum Sepolia Testnet",
    testnet: true,
    nativeAsset: "assets/native.ethereum-testnet-sepolia",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:11155111",
      namespace: "eip155",
      reference: "11155111"
    },
    assets: {
      "ETH": "assets/native.ethereum-testnet-sepolia"
    }
  },
  'OPTIMISM_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/optimism-mainnet",
    displayName: "Optimism",
    testnet: false,
    nativeAsset: "assets/native.optimism-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:10",
      namespace: "eip155",
      reference: "10"
    },
    assets: {
      "ETH": "assets/native.optimism-mainnet",
    }
  },
  'OPTIMISM_GOERLI': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/optimism-testnet-goerli",
    displayName: "Optimism Goerli Testnet",
    testnet: true,
    nativeAsset: "assets/native.optimism-testnet-goerli",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:420",
      namespace: "eip155",
      reference: "420"
    },
    assets: {}
  },
  'POLYGON_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/polygon-mainnet",
    displayName: "Polygon",
    testnet: false,
    nativeAsset: "assets/native.polygon-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:137",
      namespace: "eip155",
      reference: "137"
    },
    assets: {
      "POL": "assets/native.polygon-mainnet"
    }
  },
  'POLYGON_MUMBAI': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/polygon-testnet-mumbai",
    displayName: "Polygon Mumbai Testnet",
    testnet: true,
    nativeAsset: "assets/native.polygon-testnet-mumbai",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:80001",
      namespace: "eip155",
      reference: "80001"
    },
    assets: {}
  },
  'POLYGON_AMOY': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/polygon-testnet-amoy",
    displayName: "Polygon Amoy Testnet",
    testnet: true,
    nativeAsset: "assets/native.polygon-testnet-amoy",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:80002",
      namespace: "eip155",
      reference: "80002"
    },
    assets: {}
  },
  'ARBITRUM_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/arbitrum-mainnet",
    displayName: "Arbitrum",
    testnet: false,
    nativeAsset: "assets/native.arbitrum-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:42161",
      namespace: "eip155",
      reference: "42161"
    },
    assets: {}
  },
  'ARBITRUM_TESTNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/arbitrum-testnet-goerli",
    displayName: "Arbitrum Goerli Testnet",
    testnet: true,
    nativeAsset: "assets/native.arbitrum-testnet-goerli",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:421613",
      namespace: "eip155",
      reference: "421613"
    },
    assets: {}
  },
  'AVAX_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/avalanche-c-chain-mainnet",
    displayName: "Avalanche C-Chain",
    testnet: false,
    nativeAsset: "assets/native.avalanche-c-chain-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:43114",
      namespace: "eip155",
      reference: "43114"
    },
    assets: {}
  },
  'AVAX_TESTNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/avalanche-c-chain-testnet-fuji",
    displayName: "Avalanche C-Chain Fuji Testnet",
    testnet: true,
    nativeAsset: "assets/native.avalanche-c-chain-testnet-fuji",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:43113",
      namespace: "eip155",
      reference: "43113"
    },
    assets: {}
  },
  'BSC_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/bnb-smart-chain-mainnet",
    displayName: "Binance Smart Chain",
    testnet: false,
    nativeAsset: "assets/native.bnb-smart-chain-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:56",
      namespace: "eip155",
      reference: "56"
    },
    assets: {}
  },
  'BSC_TESTNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/bnb-smart-chain-testnet",
    displayName: "Binance Smart Chain Testnet",
    testnet: true,
    nativeAsset: "assets/native.bnb-smart-chain-testnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:97",
      namespace: "eip155",
      reference: "97"
    },
    assets: {
      "BNB": "assets/native.bnb-smart-chain-testnet",
    }
  },
  'FUSE_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/fuse-mainnet",
    displayName: "Fuse",
    testnet: false,
    nativeAsset: "assets/native.fuse-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:122",
      namespace: "eip155",
      reference: "122"
    },
    assets: {}
  },
  'FUSE_TESTNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/fuse-testnet-spark",
    displayName: "Fuse Spark Testnet",
    testnet: true,
    nativeAsset: "assets/native.fuse-testnet-spark",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:123",
      namespace: "eip155",
      reference: "123"
    },
    assets: {}
  },
  'BASE_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/base-mainnet",
    displayName: "Base",
    testnet: false,
    nativeAsset: "assets/native.base-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:8453",
      namespace: "eip155",
      reference: "8453"
    },
    assets: {}
  },
  'BASE_GOERLI': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/base-testnet-goerli",
    displayName: "Base Goerli Testnet",
    testnet: true,
    nativeAsset: "assets/native.base-testnet-goerli",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:84531",
      namespace: "eip155",
      reference: "84531"
    },
    assets: {}
  },
  'TRON_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/tron-mainnet",
    displayName: "TRON",
    testnet: false,
    nativeAsset: "assets/native.tron-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "tron:0x2b6653dc",
      namespace: "tron",
      reference: "0x2b6653dc"
    },
    assets: {
      "TRX": "assets/native.tron-mainnet"
    }
  },
  'TRON_TESTNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/tron-testnet-shasta",
    displayName: "TRON Shasta Testnet",
    testnet: true,
    nativeAsset: "assets/native.tron-testnet-shasta",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "tron:0x94a9059e",
      namespace: "tron",
      reference: "0x94a9059e"
    },
    assets: {
      "TRX": "assets/native.tron-testnet-shasta"
    }
  },
  'SOLANA_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/solana-mainnet",
    displayName: "Solana",
    testnet: false,
    nativeAsset: "assets/native.solana-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      namespace: "solana",
      reference: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
    },
    assets: {
      "SOL": "assets/native.solana-mainnet",
      "BONK": "assets/bonk.solana-mainnet",
    }
  },
  'SOLANA_DEVNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/solana-devnet",
    displayName: "Solana Devnet",
    testnet: true,
    nativeAsset: "assets/native.solana-devnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      namespace: "solana",
      reference: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
    },
    assets: {
      "SOL": "assets/native.solana-devnet"
    }
  },
  'COSMOSHUB_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/cosmoshub-mainnet",
    displayName: "CosmosHub",
    testnet: true,
    nativeAsset: "assets/native.cosmoshub-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "cosmos:cosmoshub-4",
      namespace: "cosmos",
      reference: "cosmoshub-4"
    },
    assets: {}
  },
  'OSMOSIS_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/osmosis-mainnet",
    displayName: "Osmosis",
    testnet: true,
    nativeAsset: "assets/native.osmosis-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "cosmos:osmosis-1",
      namespace: "cosmos",
      reference: "osmosis-1"
    },
    assets: {}
  },
  'INJECTIVE_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/injective-mainnet",
    displayName: "Injective",
    testnet: true,
    nativeAsset: "assets/native.injective-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "cosmos:injective-1",
      namespace: "cosmos",
      reference: "injective-1"
    },
    assets: {}
  },
  'ROOTSTOCK_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/rootstock-mainnet",
    displayName: "Rootstock",
    testnet: false,
    nativeAsset: "assets/native.rootstock-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:30",
      namespace: "eip155",
      reference: "30"
    },
    assets: {}
  },
  'TON_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/ton-mainnet",
    displayName: "TON",
    testnet: false,
    nativeAsset: "assets/native.ton-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "ton:-239",
      namespace: "ton",
      reference: "-239"
    },
    assets: {
      "TON": "assets/native.ton-mainnet",
    }
  },
  'BLAST_MAINNET': {
    $typeName: "utila.api.v1alpha2.Network",
    name: "networks/blast-mainnet",
    displayName: "Blast",
    testnet: false,
    nativeAsset: "assets/native.blast-mainnet",
    custom: false,
    caipDetails: {
      $typeName: "utila.api.v1alpha2.Network.CAIPDetails",
      chainId: "eip155:81457",
      namespace: "eip155",
      reference: "81457"
    },
    assets: {}
  }
}
