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
    chain_id: "96369",
    teleporter: "0x5B562e80A56b600d729371eB14fE3B83298D0642",
    vault: "0x08c0f48517C6d94Dd18aB5b132CA4A84FB77108e",
    node: "https://api.lux.network",
    currencies: [
      {
        name: "LUX",
        asset: "LUX",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      // main tokens
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
      // lux tokens
      {
        name: "Lux BTC",
        asset: "LBTC",
        contract_address: "0x1E48D32a4F5e9f08DB9aE4959163300FaF8A6C8e",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux ETH",
        asset: "LETH",
        contract_address: "0x60E0a8167FC13dE89348978860466C9ceC24B9ba",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux Dollar",
        asset: "LUSD",
        contract_address: "0x848Cff46eb323f323b6Bbe1Df274E40793d7f2c2",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux ZOO",
        asset: "LZOO",
        contract_address: "0x5E5290f350352768bD2bfC59c2DA15DD04A7cB88",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BNB",
        asset: "LBNB",
        contract_address: "0x6EdcF3645DeF09DB45050638c41157D8B9FEa1cf",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux POL",
        asset: "LPOL",
        contract_address: "0x28BfC5DD4B7E15659e41190983e5fE3df1132bB9",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux CELO",
        asset: "LCELO",
        contract_address: "0x3078847F879A33994cDa2Ec1540ca52b5E0eE2e5",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux FTM",
        asset: "LFTM",
        contract_address: "0x8B982132d639527E8a0eAAD385f97719af8f5e04",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux XDAI",
        asset: "LXDAI",
        contract_address: "0x7dfb3cBf7CF9c96fd56e3601FBA50AF45C731211",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux SOL",
        asset: "LSOL",
        contract_address: "0x26B40f650156C7EbF9e087Dd0dca181Fe87625B7",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux TON",
        asset: "LTON",
        contract_address: "0x3141b94b89691009b950c96e97Bff48e0C543E3C",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux ADA",
        asset: "LADA",
        contract_address: "0x8b34152832b8ab4a3274915675754AA61eC113F0",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux AVAX",
        asset: "LAVAX",
        contract_address: "0x0e4bD0DD67c15dECfBBBdbbE07FC9d51D737693D",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BLAST",
        asset: "LBLAST",
        contract_address: "0x94f49D0F4C62bbE4238F4AaA9200287bea9F2976",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BONK",
        asset: "LBONK",
        contract_address: "0xEf770a556430259d1244F2A1384bd1A672cE9e7F",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux WIF",
        asset: "LWIF",
        contract_address: "0xBBd222BD7dADd241366e6c2CbD5979F678598A85",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux Popcat",
        asset: "LPOPCAT",
        contract_address: "0x273196F2018D61E31510D1Aa1e6644955880D122",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux PNUT",
        asset: "LPNUT",
        contract_address: "0xd8ab3C445d81D78E7DC2d60FeC24f8C7328feF2f",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux MEW",
        asset: "LMEW",
        contract_address: "0xe6cd610aD16C8Fe5BCeDFff7dAB2e3d461089261",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BOME",
        asset: "LBOME",
        contract_address: "0xDF7740fCC9B244c192CfFF7b6553a3eEee0f4898",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux GIGA",
        asset: "LGIGA",
        contract_address: "0xB528C22891B05671b628eC014f4Dd20406AbD0AD",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux AI16Z",
        asset: "LAI16Z",
        contract_address: "0x5BD7c0E911f129F1A8AF5aDdF389ae9b13F23Ec8",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux FWOG",
        asset: "LFWOG",
        contract_address: "0x0E80A32Eae8e1103aF16BcF3B66C6FEf61d0AF46",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux MOODENG",
        asset: "LMOODENG",
        contract_address: "0x3D9C7a3A25561f955372b39D609bB10D1e68b4a7",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux NOT",
        asset: "LNOT",
        contract_address: "0x79b2A7FA60Ff6f328f6F5eb7Bc332CEFECEa0C93",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux DOGS",
        asset: "LDOGS",
        contract_address: "0xC7bDfc60267649C99a86a701Fc3418b7f0C3D043",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux MRB",
        asset: "LMRB",
        contract_address: "0x9cb1eDe76970E1d696D5aa6B4f65491478035271",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux REDO",
        asset: "LREDO",
        contract_address: "0x408E5681E209d37FD52c76cF9ee7EfFA8476cd9a",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Zoo Mainnet",
    internal_name: "ZOO_MAINNET",
    is_testnet: false,
    chain_id: "200200",
    teleporter: "0x5B562e80A56b600d729371eB14fE3B83298D0642",
    vault: "0x08c0f48517C6d94Dd18aB5b132CA4A84FB77108e",
    node: "https://api.zoo.network",
    currencies: [
      {
        name: "ZOO",
        asset: "ZOO",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      // main tokens
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
      // lux tokens
      {
        name: "Zoo BTC",
        asset: "ZBTC",
        contract_address: "0x1E48D32a4F5e9f08DB9aE4959163300FaF8A6C8e",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo ETH",
        asset: "ZETH",
        contract_address: "0x60E0a8167FC13dE89348978860466C9ceC24B9ba",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo Dollar",
        asset: "ZUSD",
        contract_address: "0x848Cff46eb323f323b6Bbe1Df274E40793d7f2c2",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo LUX",
        asset: "ZLUX",
        contract_address: "0x5E5290f350352768bD2bfC59c2DA15DD04A7cB88",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BNB",
        asset: "ZBNB",
        contract_address: "0x6EdcF3645DeF09DB45050638c41157D8B9FEa1cf",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo POL",
        asset: "ZPOL",
        contract_address: "0x28BfC5DD4B7E15659e41190983e5fE3df1132bB9",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo CELO",
        asset: "ZCELO",
        contract_address: "0x3078847F879A33994cDa2Ec1540ca52b5E0eE2e5",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo FTM",
        asset: "ZFTM",
        contract_address: "0x8B982132d639527E8a0eAAD385f97719af8f5e04",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo XDAI",
        asset: "ZXDAI",
        contract_address: "0x7dfb3cBf7CF9c96fd56e3601FBA50AF45C731211",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo SOL",
        asset: "ZSOL",
        contract_address: "0x26B40f650156C7EbF9e087Dd0dca181Fe87625B7",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo TON",
        asset: "ZTON",
        contract_address: "0x3141b94b89691009b950c96e97Bff48e0C543E3C",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo ADA",
        asset: "ZADA",
        contract_address: "0x8b34152832b8ab4a3274915675754AA61eC113F0",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo AVAX",
        asset: "ZAVAX",
        contract_address: "0x0EE4602429bFCEf8aEB1012F448b23532f9855Bd",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BLAST",
        asset: "ZBLAST",
        contract_address: "0x7a56c769C50F2e73CFB70b401409Ad1F1a5000cd",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BONK",
        asset: "ZBONK",
        contract_address: "0x8a873ad8CfF8ba640D71274d33a85AB1B2d53b62",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo WIF",
        asset: "ZWIF",
        contract_address: "0x4586D49f3a32c3BeCA2e09802e0aB1Da705B011D",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo Popcat",
        asset: "ZPOPCAT",
        contract_address: "0x68Cd9b8Df6E86dA02ef030c2F1e5a3Ad6B6d747F",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo PNUT",
        asset: "ZPNUT",
        contract_address: "0x0e4bD0DD67c15dECfBBBdbbE07FC9d51D737693D",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo MEW",
        asset: "ZMEW",
        contract_address: "0x94f49D0F4C62bbE4238F4AaA9200287bea9F2976",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BOME",
        asset: "ZBOME",
        contract_address: "0xEf770a556430259d1244F2A1384bd1A672cE9e7F",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo GIGA",
        asset: "ZGIGA",
        contract_address: "0xBBd222BD7dADd241366e6c2CbD5979F678598A85",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo AI16Z",
        asset: "ZAI16Z",
        contract_address: "0x273196F2018D61E31510D1Aa1e6644955880D122",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo FWOG",
        asset: "ZFWOG",
        contract_address: "0xd8ab3C445d81D78E7DC2d60FeC24f8C7328feF2f",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo MOODENG",
        asset: "ZMOODENG",
        contract_address: "0xe6cd610aD16C8Fe5BCeDFff7dAB2e3d461089261",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo PONKE",
        asset: "ZPONKE",
        contract_address: "0xDF7740fCC9B244c192CfFF7b6553a3eEee0f4898",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo NOT",
        asset: "ZNOT",
        contract_address: "0xdfCAdda48DbbA09f5678aE31734193F7CCA7f20d",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo DOGS",
        asset: "ZDOGS",
        contract_address: "0x0b0FF795d0A1C162b44CdC35D8f4DCbC2b4B9170",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo MRB",
        asset: "ZMRB",
        contract_address: "0x3FfA9267739C04554C1fe640F79651333A2040e1",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo REDO",
        asset: "ZREDO",
        contract_address: "0x137747A15dE042Cd01fCB41a5F3C7391d932750B",
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
    teleporter: "0xebD1Ee9BCAaeE50085077651c1a2dD452fc6b72e",
    vault: "0xcf963Fe4E4cE126047147661e6e06e171f366506",
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
    display_name: "Polygon",
    internal_name: "POLYGON_MAINNET",
    is_testnet: false,
    chain_id: "137",
    teleporter: "0xE09C9b6Ed2BADAa97AB00652dF75da05adc6dAeF",
    vault: "0x217feE2a1a6A31Dda68433270531F56C91EC8D2B",
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
        contract_address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
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
        contract_address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
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
    teleporter: "0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95",
    vault: "0x37d9fB96722ebDDbC8000386564945864675099B",
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
    teleporter: "0xA60429080752484044e529012aA46e1D691f50Ab",
    vault: "0xE6e3E18F86d5C35ec1E24c0be8672c8AA9989258",
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
    teleporter: "0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95",
    vault: "0x37d9fB96722ebDDbC8000386564945864675099B",
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
        contract_address: "0xef4229c8c3250C675F21BCefa42f58EfbfF6002a",
        decimals: 6,
        is_native: false
      },
      {
        name: "cUSD",
        asset: "USDC",
        contract_address: "0x765de816845861e75a25fca122bb6898b8b1282a",
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
    teleporter: "0x37d9fB96722ebDDbC8000386564945864675099B",
    vault: "0x3226bb1d3055685EFC1b0E49718B909a1c6Ce18d",
    node: `https://lb.drpc.org/ogrpc?network=base&dkey=${DRPC_KEY}`,
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
        contract_address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
        decimals: 6,
        is_native: false
      },
      {
        name: "Coinbase Wrapped BTC",
        asset: "cbBTC",
        contract_address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
        decimals: 8,
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
    teleporter: "0xebD1Ee9BCAaeE50085077651c1a2dD452fc6b72e",
    vault: "0xcf963Fe4E4cE126047147661e6e06e171f366506",
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
    display_name: "Avalanche",
    internal_name: "AVAX_MAINNET",
    is_testnet: false,
    chain_id: "43114",
    teleporter: "0x3226bb1d3055685EFC1b0E49718B909a1c6Ce18d",
    vault: "0x6149D8C44Ec9a4a683d14E494a73B1b11ac331A8",
    node: `https://lb.drpc.org/ogrpc?network=avalanche&dkey=${DRPC_KEY}`,
    currencies: [
      {
        name: "AVAX",
        asset: "AVAX",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      {
        name: "WETH.e",
        asset: "WETH",
        contract_address: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT.e",
        asset: "USDT",
        contract_address: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118",
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
        name: "BTC.b",
        asset: "WBTC",
        contract_address: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
        decimals: 8,
        is_native: false
      }
    ]
  },
  {
    display_name: "Zora",
    internal_name: "ZORA_MAINNET",
    is_testnet: false,
    chain_id: "7777777",
    teleporter: "0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95",
    vault: "0x37d9fB96722ebDDbC8000386564945864675099B",
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
        name: "USDzC",
        asset: "USDC",
        contract_address: "0xCccCCccc7021b32EBb4e8C08314bD62F7c653EC4",
        decimals: 6,
        is_native: false
      }
    ]
  },
  {
    display_name: "Blast",
    internal_name: "BLAST_MAINNET",
    is_testnet: false,
    chain_id: "81457",
    teleporter: "0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95",
    vault: "0x37d9fB96722ebDDbC8000386564945864675099B",
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
        name: "BLAST",
        asset: "BLAST",
        contract_address: "0xb1a5700fA2358173Fe465e6eA4Ff52E36e88E2ad",
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
    teleporter: "0x1e48d32a4f5e9f08db9ae4959163300faf8a6c8e",
    vault: "0x3226bb1d3055685EFC1b0E49718B909a1c6Ce18d",
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
        contract_address: "0xa219439258ca9da29e9cc4ce5596924745e12b93",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC.e",
        asset: "USDC",
        contract_address: "0x176211869ca2b568f2a7d4ee941e073a821ee1ff",
        decimals: 6,
        is_native: false
      },
      {
        name: "Wrapped BTC",
        asset: "WBTC",
        contract_address: "0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4",
        decimals: 8,
        is_native: false
      }
    ]
  },
  {
    display_name: "Fantom",
    internal_name: "FANTOM_MAINNET",
    is_testnet: false,
    chain_id: "250",
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
  }
]
export const TEST_NETWORKS: NETWORK[] = [
  {
    display_name: "Ethereum Sepolia",
    internal_name: "ETHEREUM_SEPOLIA",
    is_testnet: true,
    chain_id: "11155111",
    teleporter: "0xb34e8a93A56De724c432fD41052E715657Fb0B1D",
    vault: "0x63139CFe43cEe881332a2264851940108333e8D0",
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
    display_name: "Holesky Testnet",
    internal_name: "HOLESKY_TESTNET",
    is_testnet: true,
    chain_id: "17000",
    teleporter: "0x2951A9386df11a4EA8ae5A823B94DC257dEb35Cb",
    vault: "0xebD1Ee9BCAaeE50085077651c1a2dD452fc6b72e",
    node: `https://eth-holesky.g.alchemy.com/v2/${ALCHEMY_KEY}`,
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
        contract_address: "0xcf963Fe4E4cE126047147661e6e06e171f366506",
        decimals: 18,
        is_native: false
      },
      {
        name: "USDT",
        asset: "USDT",
        contract_address: "0xD257ADA332da217c78959A609e97c71ce5214925",
        decimals: 6,
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "0x15BA7dCA26c63029E33C81f7B3978B54Bc0CB08B",
        decimals: 6,
        is_native: false
      },
      {
        name: "DAI",
        asset: "DAI",
        contract_address: "0x9F47CeB09cb88362f0274Bb354a9807Fd976D963",
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
    teleporter: "0xE139056397091c15F860E94b20cCc169520b086A",
    vault: "0x2c4908f1B607A4448272ea29A054bf9AA08A1D76",
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
    teleporter: "0xD293337c79A951C0e93aEb6a5E255097d65b671f",
    vault: "0xe0feC703840364714b97272973B8945FD5eB5600",
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
    chain_id: "96368",
    teleporter: "0x5B562e80A56b600d729371eB14fE3B83298D0642",
    vault: "0x08c0f48517C6d94Dd18aB5b132CA4A84FB77108e",
    node: "https://api.lux-test.network",
    currencies: [
      {
        name: "LUX",
        asset: "LUX",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      // main tokens
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
      // lux tokens
      {
        name: "Lux BTC",
        asset: "LBTC",
        contract_address: "0x1E48D32a4F5e9f08DB9aE4959163300FaF8A6C8e",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux ETH",
        asset: "LETH",
        contract_address: "0x60E0a8167FC13dE89348978860466C9ceC24B9ba",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux Dollar",
        asset: "LUSD",
        contract_address: "0x848Cff46eb323f323b6Bbe1Df274E40793d7f2c2",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux ZOO",
        asset: "LZOO",
        contract_address: "0x5E5290f350352768bD2bfC59c2DA15DD04A7cB88",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BNB",
        asset: "LBNB",
        contract_address: "0x6EdcF3645DeF09DB45050638c41157D8B9FEa1cf",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux POL",
        asset: "LPOL",
        contract_address: "0x28BfC5DD4B7E15659e41190983e5fE3df1132bB9",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux CELO",
        asset: "LCELO",
        contract_address: "0x3078847F879A33994cDa2Ec1540ca52b5E0eE2e5",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux FTM",
        asset: "LFTM",
        contract_address: "0x8B982132d639527E8a0eAAD385f97719af8f5e04",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux XDAI",
        asset: "Lux XDAI",
        contract_address: "0x7dfb3cBf7CF9c96fd56e3601FBA50AF45C731211",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux SOL",
        asset: "LSOL",
        contract_address: "0x26B40f650156C7EbF9e087Dd0dca181Fe87625B7",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux TON",
        asset: "LTON",
        contract_address: "0x3141b94b89691009b950c96e97Bff48e0C543E3C",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux ADA",
        asset: "LADA",
        contract_address: "0x8b34152832b8ab4a3274915675754AA61eC113F0",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux AVAX",
        asset: "LAVAX",
        contract_address: "0x8fa9C0aeb525AF23b6A2e3f18a7d306280FD8C94",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BLAST",
        asset: "LBLAST",
        contract_address: "0x86B52f1c726BCCcF1CC517AF4fB2983A9e978078",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BONK",
        asset: "LBONK",
        contract_address: "0xEa0Dd891Dd65b472a52cb48EbddA491612c8aE81",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux WIF",
        asset: "LWIF",
        contract_address: "0x0D15Fb059AE5DBb2826875591C450a2e59bFE9cA",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux Popcat",
        asset: "LPOPCAT",
        contract_address: "0xE48e3F2F82449c8A5d14E841d0db6544AA933552",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux PNUT",
        asset: "LPNUT",
        contract_address: "0x6d5a2779313faa0CF50882D5338de19352267935",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux MEW",
        asset: "LMEW",
        contract_address: "0xf4Bf3d21C6F7559FDFc4Eaeeeb76f896884eC3bb",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux BOME",
        asset: "LBOME",
        contract_address: "0x1a08b4D4144027f8E262892A78D493dD660D270d",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux GIGA",
        asset: "LGIGA",
        contract_address: "0x695249d2624A269bb04B948bb8ABB876b21Fd0B1",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux AI16Z",
        asset: "LAI16Z",
        contract_address: "0x475b2846FfcfCF66294B5A829ee44dE4aBDdFf12",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux FWOG",
        asset: "LFWOG",
        contract_address: "0xA83bCcd4542f6d27ad3698f5311265D87910b72a",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux MOODENG",
        asset: "LMOODENG",
        contract_address: "0xf8a40f7209032037C719Ab5EA7Ad12643F258787",
        decimals: 18,
        is_native: false
      },
      {
        name: "Lux PONKE",
        asset: "LPONKE",
        contract_address: "0x40cbF49487F30082A233A73759cAE283F81113AE",
        decimals: 18,
        is_native: false
      }
    ]
  },
  {
    display_name: "Zoo Testnet",
    internal_name: "ZOO_TESTNET",
    is_testnet: true,
    chain_id: "200201",
    teleporter: "0x5B562e80A56b600d729371eB14fE3B83298D0642",
    vault: "0x08c0f48517C6d94Dd18aB5b132CA4A84FB77108e",
    node: "https://api.zoo-test.network",
    currencies: [
      {
        name: "ZOO",
        asset: "ZOO",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        is_native: true
      },
      // main tokens
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
      // lux tokens
      {
        name: "Zoo BTC",
        asset: "ZBTC",
        contract_address: "0x1E48D32a4F5e9f08DB9aE4959163300FaF8A6C8e",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo ETH",
        asset: "ZETH",
        contract_address: "0x60E0a8167FC13dE89348978860466C9ceC24B9ba",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo Dollar",
        asset: "ZUSD",
        contract_address: "0x848Cff46eb323f323b6Bbe1Df274E40793d7f2c2",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo LUX",
        asset: "ZLUX",
        contract_address: "0x5E5290f350352768bD2bfC59c2DA15DD04A7cB88",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BNB",
        asset: "ZBNB",
        contract_address: "0x6EdcF3645DeF09DB45050638c41157D8B9FEa1cf",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo POL",
        asset: "ZPOL",
        contract_address: "0x28BfC5DD4B7E15659e41190983e5fE3df1132bB9",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo CELO",
        asset: "ZCELO",
        contract_address: "0x3078847F879A33994cDa2Ec1540ca52b5E0eE2e5",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo FTM",
        asset: "ZFTM",
        contract_address: "0x8B982132d639527E8a0eAAD385f97719af8f5e04",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo XDAI",
        asset: "ZXDAI",
        contract_address: "0x7dfb3cBf7CF9c96fd56e3601FBA50AF45C731211",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo SOL",
        asset: "ZSOL",
        contract_address: "0x26B40f650156C7EbF9e087Dd0dca181Fe87625B7",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo TON",
        asset: "ZTON",
        contract_address: "0x3141b94b89691009b950c96e97Bff48e0C543E3C",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo ADA",
        asset: "ZADA",
        contract_address: "0x8b34152832b8ab4a3274915675754AA61eC113F0",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo AVAX",
        asset: "ZAVAX",
        contract_address: "0x8fa9C0aeb525AF23b6A2e3f18a7d306280FD8C94",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BLAST",
        asset: "ZBLAST",
        contract_address: "0x86B52f1c726BCCcF1CC517AF4fB2983A9e978078",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BONK",
        asset: "ZBONK",
        contract_address: "0xEa0Dd891Dd65b472a52cb48EbddA491612c8aE81",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo WIF",
        asset: "ZWIF",
        contract_address: "0x0D15Fb059AE5DBb2826875591C450a2e59bFE9cA",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo Popcat",
        asset: "ZPOPCAT",
        contract_address: "0xE48e3F2F82449c8A5d14E841d0db6544AA933552",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo PNUT",
        asset: "ZPNUT",
        contract_address: "0x6d5a2779313faa0CF50882D5338de19352267935",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo MEW",
        asset: "ZMEW",
        contract_address: "0xf4Bf3d21C6F7559FDFc4Eaeeeb76f896884eC3bb",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo BOME",
        asset: "ZBOME",
        contract_address: "0x1a08b4D4144027f8E262892A78D493dD660D270d",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo GIGA",
        asset: "ZGIGA",
        contract_address: "0x695249d2624A269bb04B948bb8ABB876b21Fd0B1",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo AI16Z",
        asset: "ZAI16Z",
        contract_address: "0x475b2846FfcfCF66294B5A829ee44dE4aBDdFf12",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo FWOG",
        asset: "ZFWOG",
        contract_address: "0xA83bCcd4542f6d27ad3698f5311265D87910b72a",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo MOODENG",
        asset: "ZMOODENG",
        contract_address: "0xf8a40f7209032037C719Ab5EA7Ad12643F258787",
        decimals: 18,
        is_native: false
      },
      {
        name: "Zoo PONKE",
        asset: "ZPONKE",
        contract_address: "0x40cbF49487F30082A233A73759cAE283F81113AE",
        decimals: 18,
        is_native: false
      }
    ]
  }
]

export const SWAP_PAIRS: Record<string, string[]> = {
  // lux tokens
  LUX: ["ZLUX"],
  LBTC: ["ZBTC", "WBTC", "cbBTC"],
  LETH: ["ETH", "WETH", "ZETH"],
  LUSD: ["USDT", "USDC", "DAI", "ZUSD"],
  LZOO: ["ZOO"],
  LBNB: ["BNB", "ZBNB"],
  LPOL: ["POL", "ZPOL"],
  LCELO: ["CELO", "ZCELO"],
  LFTM: ["FTM", "ZFTM"],
  LXDAI: ["XDAI", "ZXDAI"],
  LSOL: ["ZSOL"],
  LTON: ["ZTON"],
  LADA: ["ZADA"],
  LAVAX: ["AVAX", "ZAVAX"],
  LBLAST: ["ZBLAST", "BLAST"],
  LBONK: ["ZBONK"],
  LWIF: ["ZWIF"],
  LPOPCAT: ["ZPOPCAT"],
  LPNUT: ["ZPNUT"],
  LMEW: ["ZMEW"],
  LBOME: ["ZBOME"],
  LGIGA: ["ZGIGA"],
  LAI16Z: ["ZAI16Z"],
  LFWOG: ["ZFWOG"],
  LMOODENG: ["ZMOODENG"],
  LPONKE: ["ZPONKE"],
  LNOT: ["ZNOT"],
  LDOGS: ["ZDOGS"],
  LMRB: ["ZMRB"],
  LREDO: ["ZREDO"],

  // Zoo tokens
  ZOO: ["LZOO"],
  ZBTC: ["LBTC", "WBTC", "cbBTC"],
  ZETH: ["ETH", "WETH", "LETH"],
  ZUSD: ["USDT", "USDC", "DAI", "LUSD"],
  ZLUX: ["LUX"],
  ZBNB: ["BNB", "LBNB"],
  ZPOL: ["POL", "LPOL"],
  ZCELO: ["CELO", "LCELO"],
  ZFTM: ["FTM", "LFTM"],
  ZXDAI: ["XDAI", "LXDAI"],
  ZSOL: ["LSOL"],
  ZTON: ["LTON"],
  ZADA: ["LADA"],
  ZAVAX: ["AVAX", "LAVAX"],
  ZBLAST: ["LBLAST", "BLAST"],
  ZBONK: ["LBONK"],
  ZWIF: ["LWIF"],
  ZPOPCAT: ["LPOPCAT"],
  ZPNUT: ["LPNUT"],
  ZMEW: ["LMEW"],
  ZBOME: ["LBOME"],
  ZGIGA: ["LGIGA"],
  ZAI16Z: ["LAI16Z"],
  ZFWOG: ["LFWOG"],
  ZMOODENG: ["LMOODENG"],
  ZPONKE: ["LPONKE"],
  ZNOT: ["LNOT"],
  ZDOGS: ["LDOGS"],
  ZMRB: ["LMRB"],
  ZREDO: ["LREDO"],

  // Evm tokens
  ETH: ["LETH", "ZETH"],
  WETH: ["LETH", "ZETH"],
  WBTC: ["LBTC", "ZBTC"],
  cbBTC: ["LBTC", "ZBTC"],
  POL: ["LPOL", "ZPOL"],
  BNB: ["LBNB", "ZBNB"],
  FTM: ["LFTM", "ZFTM"],
  DAI: ["LUSD", "ZUSD"],
  USDT: ["LUSD", "ZUSD"],
  USDC: ["LUSD", "ZUSD"],
  CELO: ["LCELO", "ZCELO"],
  XDAI: ["LXDAI", "ZXDAI"],
  AVAX: ["LAVAX", "ZAVAX"],
  BLAST: ["LBLAST", "ZBLAST"]
}
