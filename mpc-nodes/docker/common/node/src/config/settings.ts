const DRPC_KEY = process.env.DRPC_KEY
const ALCHEMY_KEY = process.env.ALCHEMY_KEY

type TOKEN = {
  name: string
  asset: string
  contract_address: null | string
  decimals: number
  is_native: boolean
}

type NETWORK = {
  display_name: string
  internal_name: string
  is_testnet: boolean
  chain_id: string
  node: string
  teleporter: string
  vault: string
  currencies: TOKEN[]
}

export const MAIN_NETWORKS: NETWORK[] = [
  {
    display_name: "Lux",
    internal_name: "LUX_MAINNET",
    is_testnet: false,
    chain_id: "7777",
    teleporter: "",
    vault: "",
    node: "https://api.lux.network",
    currencies: [
      {
        name: "LUX",
        asset: "LUX",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x...",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x...",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x...",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x...",
        decimals: 18,
        is_native: false
      },
      {
        name: "LETH",
        asset: "LETH",
        contract_address: "0xA7EF94FfacA04aA51aCB66Ad93691a10Ce6eAcf4",
        decimals: 18,
        is_native: false
      },
      {
        name: "LBTC",
        asset: "LBTC",
        contract_address: "",
        decimals: 18,
        is_native: false
      },
      {
        name: "LUSD",
        asset: "LUSD",
        contract_address: "",
        decimals: 18,
        is_native: false
      },
      {
        name: "LFTM",
        asset: "LFTM",
        contract_address: "",
        decimals: 18,
        is_native: false
      },
      {
        name: "LCELO",
        asset: "LCELO",
        contract_address: "",
        decimals: 18,
        is_native: false
      },
      {
        name: "LPOL",
        asset: "LPOL",
        contract_address: "",
        decimals: 18,
        is_native: false
      },
      {
        name: "LXDAI",
        asset: "LXDAI",
        contract_address: "",
        decimals: 18,
        is_native: false
      },
      {
        name: "LBNB",
        asset: "LBNB",
        contract_address: "",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Ethereum",
    internal_name: "ETHEREUM_MAINNET",
    is_testnet: false,
    chain_id: "1",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=ethereum&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "POLYGON",
    internal_name: "POLYGON_MAINNET",
    is_testnet: false,
    chain_id: "137",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=polygon&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "POL",
        asset: "POL",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Optimism",
    internal_name: "OPTIMISM_MAINNET",
    is_testnet: false,
    chain_id: "10",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=optimism&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x4200000000000000000000000000000000000006",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Arbitrum One",
    internal_name: "ARBITRUM_MAINNET",
    is_testnet: false,
    chain_id: "42161",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=arbitrum&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Celo",
    internal_name: "CELO_MAINNET",
    is_testnet: false,
    chain_id: "42220",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=celo&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "CELO",
        asset: "CELO",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x122013fd7dF1C6F636a5bb8f03108E876548b455",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0xef4229c8c3250c675f21bcefa42f58efbff6002a",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0xE4fE50cdD716522A56204352f00AA110F731932d",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Base",
    internal_name: "BASE_MAINNET",
    is_testnet: false,
    chain_id: "8453",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=base&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "CELO",
        asset: "CELO",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x4200000000000000000000000000000000000006",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Binance Smart Chain",
    internal_name: "BSC_MAINNET",
    is_testnet: false,
    chain_id: "56",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=bsc&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "BNB",
        asset: "BNB",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x7b03a103fc847348e5e59f8d3b0740c48d597973",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Gnosis",
    internal_name: "GNOSIS_MAINNET",
    is_testnet: false,
    chain_id: "100",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=gnosis&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "xDAI",
        asset: "xDAI",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x4ecaba5870353805a9f068101a40e0f32ed605c6",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x44fa8e6f47987339850636f88629646662444217",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Avalanche",
    internal_name: "AVAX_MAINNET",
    is_testnet: false,
    chain_id: "43114",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=avalanche&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xde3a24028580884448a5397872046a019649b084",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "FANTOM",
    internal_name: "FANTOM_MAINNET",
    is_testnet: false,
    chain_id: "42220",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=fantom&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "FTM",
        asset: "FTM",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x695921034f0387eac4e11620ee91b1b15a6a09fe",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xcc1b99ddac1a33c201a742a1851662e87bc7f22c",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x04068da6c83afcfa0e13ba15a6696662335d5b75",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Aurora",
    internal_name: "AURORA_MAINNET",
    is_testnet: false,
    chain_id: "1313161554",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=aurora&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x4988a896b1227218e4A686fdE5EabdcAbd91571f",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x368ebb46aca6b8d0787c96b2b20bd3cc3f2c45f7",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0xe3520349f477a5f6eb06107066048508498a291b",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Zora",
    internal_name: "ZORA_MAINNET",
    is_testnet: false,
    chain_id: "7777777",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=zora&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x4200000000000000000000000000000000000006",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x...",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x...",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x...",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Blast",
    internal_name: "BLAST_MAINNET",
    is_testnet: false,
    chain_id: "81457",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=blast&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x4300000000000000000000000000000000000004",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x0be9a0e280962213bf85c4f8669359291b2e404a",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0xcdb5835bdb75c5b3671633d12d7e0db6be5873a5",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x9C6Fc5bF860A4a012C9De812002dB304AD04F581",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Linea",
    internal_name: "LINEA_MAINNET",
    is_testnet: false,
    chain_id: "59144",
    teleporter: "",
    vault: "",
    node: `https://lb.drpc.org/ogrpc?network=linea&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x4af15ec2a0bd43db75dd04e62faa3b8ef36b00d5",
        decimals: 18,
        is_native: false
      }
    ]
  }
]
export const TEST_NETWORKS: NETWORK[] = [
  {
    display_name: "Ethereum Sepolia",
    internal_name: "ETHEREUM_SEPOLIA",
    is_testnet: true,
    chain_id: "11155111",
    teleporter: "0x306533aaedc8d2e28F05a7d42E999730C45aB5B1",
    vault: "0xF2d3BE50D818d48A4e516FbaBb61609F9792CfA6",
    node: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x1a21E9c483200714489B575851e75d4C9525588E",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xE9FF4E487ffcA25a765D5445CC8665128Ac35820",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x299e04DE65090D3C48019893e369A7983124c514",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x3FADaC51B852273e11Da42Db30714FddA785b8C5",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Base Sepolia",
    internal_name: "BASE_SEPOLIA",
    is_testnet: true,
    chain_id: "84532",
    teleporter: "0x6374d9d1E0CB5eA5e77D92E9a306f7f2ec41660a",
    vault: "0x3Aa3179Bd3A8b1d8269dd840E39f8112fb3eD27a",
    node: "https://sepolia.base.org",
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x7390C3FA8576a0E9E7c788cc7955c3151c4c1612",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x46390FA219b22f739C63F0bF1c165a1FBc30B57c",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0xE49355609F94A4B8a2EfC6FBd077542F8EC90080",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "BSC Testnet",
    internal_name: "BSC_TESTNET",
    is_testnet: true,
    chain_id: "97",
    teleporter: "0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e",
    vault: "0xE49355609F94A4B8a2EfC6FBd077542F8EC90080",
    node: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    currencies: [
      {
        name: "BNB",
        asset: "BNB",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0xA5fec41B6B2C98dd6036df4030396C947aFe1AcB",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x5519582dde6eb1f53F92298622c2ecb39A64369A",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x6a49DbeD52B9Bd9a53E21C3bCb67dc2697cD6697",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x2E8A24dE21105772FD161BF56471A0470A8AF45e",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Lux Testnet",
    internal_name: "LUX_TESTNET",
    is_testnet: true,
    chain_id: "8888",
    teleporter: "0x23E4BFDAC278FFE22DbBFAc5c1474E10cE7631CD",
    vault: "0x43A4Ab078Edcd3e28385C714950fd099c9595279",
    node: "https://api.lux-test.network",
    currencies: [
      {
        name: "LUX",
        asset: "LUX",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "Wrapped Ether",
        asset: "WETH",
        contract_address: "0x...",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0x...",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x...",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x...",
        decimals: 18,
        is_native: false
      },
      {
        name: "LETH",
        asset: "LETH",
        contract_address: "0x999Ab39dF1Ae0F0069303B430A52f16FFdaAC69C",
        decimals: 18,
        is_native: false
      },
      {
        name: "LBTC",
        asset: "LBTC",
        contract_address: "0xD293337c79A951C0e93aEb6a5E255097d65b671f",
        decimals: 18,
        is_native: false
      },
      {
        name: "LUSD",
        asset: "LUSD",
        contract_address: "0xA7EF94FfacA04aA51aCB66Ad93691a10Ce6eAcf4",
        decimals: 18,
        is_native: false
      },
      {
        name: "LFTM",
        asset: "LFTM",
        contract_address: "0xE1276a2F675A1D7F69FC2C78Ca6a39d1D951fD35",
        decimals: 18,
        is_native: false
      },
      {
        name: "LCELO",
        asset: "LCELO",
        contract_address: "0xe0feC703840364714b97272973B8945FD5eB5600",
        decimals: 18,
        is_native: false
      },
      {
        name: "LPOL",
        asset: "LPOL",
        contract_address: "0x305B062C74F92d05de7Cbccd1923f19c7B27eAB1",
        decimals: 18,
        is_native: false
      },
      {
        name: "LXDAI",
        asset: "LXDAI",
        contract_address: "0x426123c16f821A1C945F57d8730210185DA16724",
        decimals: 18,
        is_native: false
      },
      {
        name: "LBNB",
        asset: "LBNB",
        contract_address: "0x2c04439Dc52080E56882f61B2C4fb059A412fD5b",
        decimals: 18,
        is_native: false
      }
    ]
  }
]

export const SWAP_PAIRS: Record<string, string[]> = {
  LETH: ["ETH"],
  LBNB: ["BNB"],
  LFTM: ["FTM"],
  LPOL: ["POL", "MATIC"],
  LUSD: ["USDT", "USDC", "DAI"],
  LWETH: ["WETH"],
  LCELO: ["CELO"],
  LXDAI: ["XDAI"],

  ETH: ["LETH"],
  POL: ["LPOL"],
  BNB: ["LBNB"],
  FTM: ["LFTM"],
  DAI: ["LUSD"],
  WETH: ["LWETH"],
  CELO: ["LCELO"],
  XDAI: ["LXDAI"],
  USDT: ["LUSD"],
  USDC: ["LUSD"]
}
