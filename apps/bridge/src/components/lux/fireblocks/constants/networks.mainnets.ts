import { type Network } from "@/types/teleport";

export const networks: Network[] = [
  {
    display_name: "Ethereum",
    internal_name: "ETHEREUM_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
    is_testnet: false,
    is_featured: true,
    average_completion_time: "00:01:04.0494430",
    chain_id: 1,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://sepolia.basescan.org/tx/{0}", // sepolia
    account_explorer_template: "https://sepolia.basescan.org/address/{0}", // sepolia
    node: "https://sepolia.base.org", // sepolia
    currencies: [
      {
        name: "ETH",
        asset: "ETH",
        logo: "https://cdn.lux.network/bridge/currencies/ethereum_eth.svg",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: true,
      },
      {
        name: "USDT",
        asset: "USDT",
        logo: "https://cdn.lux.network/bridge/currencies/usdt.png",
        contract_address: "0x46390FA219b22f739C63F0bF1c165a1FBc30B57c",
        decimals: 6,
        status: "active",
        is_deposit_enabled: false,
        is_withdrawal_enabled: false,
        is_refuel_enabled: false,
        max_withdrawal_amount: 0,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "USDC",
        asset: "USDC",
        logo: "https://cdn.lux.network/bridge/currencies/usdc.png",
        contract_address: "0xE49355609F94A4B8a2EfC6FBd077542F8EC90080", //sepolia
        decimals: 6,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: true,
        max_withdrawal_amount: 3000,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "DAI",
        asset: "DAI",
        logo: "https://cdn.lux.network/bridge/currencies/dai.png",
        contract_address: "0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: true,
        max_withdrawal_amount: 3000,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
    ],
  },
  {
    display_name: "OPTIMISM",
    internal_name: "OPTIMISM_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/optimism_mainnet.png",
    is_testnet: false,
    is_featured: true,
    average_completion_time: "00:00:07.7777777",
    chain_id: 10,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 1,
    transaction_explorer_template:
      "https://https://optimistic.etherscan.io/tx/{0}",
    account_explorer_template:
      "https://https://optimistic.etherscan.io//address/{0}",
    node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
    currencies: [],
  },
  {
    display_name: "Arbitrum",
    internal_name: "ARBITRUM_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/arbitrum_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:04.0494430",
    chain_id: 42161,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://arbiscan.io/tx/{0}",
    account_explorer_template: "https://arbiscan.io/address/{0}",
    node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
    currencies: [],
  },
  {
    display_name: "Celo",
    internal_name: "CELO_MAINNET",
    native_currency: "CELO",
    logo: "https://cdn.lux.network/bridge/networks/celo_mainnet.svg",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:04.0494430",
    chain_id: 42220,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://celoscan.io/tx/{0}",
    account_explorer_template: "https://celoscan.io/address/{0}",
    node: "https://celo.drpc.org",
    currencies: [],
  },
  {
    display_name: "BASE",
    internal_name: "BASE_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/base_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:04.0494430",
    chain_id: 8453,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://basescan.io/tx/{0}",
    account_explorer_template: "https://basescan.io/address/{0}",
    node: "https://mainnet.base.org",
    currencies: [],
  },
  {
    display_name: "Binance Smart Chain",
    internal_name: "BSC_MAINNET",
    native_currency: "BNB",
    logo: "https://cdn.lux.network/bridge/networks/bsc_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:04.0494430",
    chain_id: 56,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://testnet.bscscan.com/tx/{0}",
    account_explorer_template: "https://testnet.bscscan.com/address/{0}",
    node: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    currencies: [
      {
        name: "BNB",
        asset: "BNB",
        logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: true,
      },
      {
        name: "USDT",
        asset: "USDT",
        logo: "https://cdn.lux.network/bridge/currencies/usdt.png",
        contract_address: "0x5519582dde6eb1f53F92298622c2ecb39A64369A",
        decimals: 6,
        status: "active",
        is_deposit_enabled: false,
        is_withdrawal_enabled: false,
        is_refuel_enabled: false,
        max_withdrawal_amount: 0,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "USDC",
        asset: "USDC",
        logo: "https://cdn.lux.network/bridge/currencies/usdc.png",
        contract_address: "0x6a49DbeD52B9Bd9a53E21C3bCb67dc2697cD6697",
        decimals: 6,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: true,
        max_withdrawal_amount: 3000,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "DAI",
        asset: "DAI",
        logo: "https://cdn.lux.network/bridge/currencies/dai.png",
        contract_address: "0x2E8A24dE21105772FD161BF56471A0470A8AF45e",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 500,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
    ],
  },
  {
    display_name: "Gnosis",
    internal_name: "GNOSIS_MAINNET",
    native_currency: "XDAI",
    logo: "https://cdn.lux.network/bridge/networks/gnosis_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:04.0494430",
    chain_id: 100,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://gnosisscan.io/tx/{0}",
    account_explorer_template: "https://gnosisscan.io/address/{0}",
    node: "https://rpc.gnosischain.com",
    currencies: [],
  },
  {
    display_name: "Avalanche One",
    internal_name: "AVAX_MAINNET",
    native_currency: "AVAX",
    logo: "https://cdn.lux.network/bridge/networks/avax_mainnet.png",
    is_testnet: false,
    is_featured: true,
    average_completion_time: "00:00:07.7777777",
    chain_id: 43114,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://snowtrace.io/tx/{0}",
    account_explorer_template: "https://snowtrace.io/address/{0}",
    node: "https://api.avax.network/ext/bc/c/rpc",
    currencies: [],
  },
  {
    display_name: "Fantom",
    internal_name: "FANTOM_MAINNET",
    native_currency: "FTM",
    logo: "https://cdn.lux.network/bridge/networks/fantom_mainnet.svg",
    is_testnet: false,
    is_featured: true,
    average_completion_time: "00:00:07.7777777",
    chain_id: 250,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://ftmscan.io/tx/{0}",
    account_explorer_template: "https://ftmscan.io/address/{0}",
    node: "https://rpcapi.fantom.network",
    currencies: [],
  },
  {
    display_name: "Aurora",
    internal_name: "AURORA_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/fantom_mainnet.svg",
    is_testnet: false,
    is_featured: true,
    average_completion_time: "00:00:07.7777777",
    chain_id: 1313161554,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://explorer.aurora.dev/tx/{0}",
    account_explorer_template: "https://explorer.aurora.dev/address/{0}",
    node: "https://mainnet.aurora.dev",
    currencies: [],
  },
  {
    display_name: "Zora",
    internal_name: "ZORA_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/zora_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:04.0494430",
    chain_id: 7777777,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://explorer.zora.energy/tx/{0}",
    account_explorer_template: "https://explorer.zora.energy/address/{0}",
    node: "https://rpc.zora.energy",
    currencies: [],
  },
  {
    display_name: "Blast",
    internal_name: "BLAST_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/blast_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:04.0494430",
    chain_id: 81457,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://blastscan.io/tx/{0}",
    account_explorer_template: "https://blastscan.io/address/{0}",
    node: "https://rpc.blast.io",
    currencies: [],
  },
  {
    display_name: "Linea",
    internal_name: "LINEA_MAINNET",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/linea_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:01:12.1184390",
    chain_id: 59144,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://lineascan.build/tx/{0}",
    account_explorer_template: "https://lineascan.build/address/{0}",
    node: "https://rpc.linea.build",
    currencies: [],
  },
  {
    display_name: "Lux",
    internal_name: "LUX_MAINNET",
    native_currency: "LUX",
    logo: "https://cdn.lux.network/bridge/networks/lux_mainnet.png",
    is_testnet: false,
    is_featured: true,
    average_completion_time: "00:00:07.7777777",
    chain_id: 7777,
    status: "inactive",
    type: "evm",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://explore.lux.network/tx/{0}",
    account_explorer_template: "https://explore.lux.network/address/{0}",
    node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
    currencies: [
      {
        name: "LUX",
        asset: "LUX",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lux.svg",
        contract_address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        status: "inactive",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: true,
      },
      {
        name: "Lux ETH",
        asset: "LETH",
        logo: "https://cdn.lux.network/bridge/currencies/lux/leth.svg",
        contract_address: "0x999Ab39dF1Ae0F0069303B430A52f16FFdaAC69C",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "Lux POL",
        asset: "LPOL",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lpol.svg",
        contract_address: "0x305B062C74F92d05de7Cbccd1923f19c7B27eAB1",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "Lux BNB",
        asset: "LBNB",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lbnb.svg",
        contract_address: "0x2c04439Dc52080E56882f61B2C4fb059A412fD5b",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "Lux FTM",
        asset: "LFTM",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lftm.svg",
        contract_address: "0xE1276a2F675A1D7F69FC2C78Ca6a39d1D951fD35",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "Lux CELO",
        asset: "LCELO",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lcelo.svg",
        contract_address: "0xe0feC703840364714b97272973B8945FD5eB5600",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "Lux xDAI",
        asset: "LXDAI",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lxdai.svg",
        contract_address: "0xe0feC703840364714b97272973B8945FD5eB5600",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
      {
        name: "Lux Dollar",
        asset: "LUSD",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lusd.svg",
        contract_address: "0xA7EF94FfacA04aA51aCB66Ad93691a10Ce6eAcf4",
        decimals: 18,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      },
    ],
  },
];