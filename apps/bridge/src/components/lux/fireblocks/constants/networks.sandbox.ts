import { type Network } from "@/types/teleport";

export const networks: Network[] = [
  {
    display_name: "Bitcoin",
    internal_name: "Bitcoin_MAINNET",
    native_currency: "BTC",
    logo: "https://cdn.lux.network/bridge/networks/bitcoin_mainnet.png",
    is_testnet: false,
    is_featured: true,
    average_completion_time: "00:04:39.5276290",
    chain_id: null,
    status: "active",
    type: "btc",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://btcscan.org/tx/{0}",
    account_explorer_template: "https://btcscan.org/address/{0}",
    node: "",
    currencies: [
      {
        name: "BTC",
        asset: "BTC",
        contract_address: "",
        logo: "https://cdn.lux.network/bridge/currencies/btc.png",
        decimals: 8,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: false,
        is_refuel_enabled: false,
        max_withdrawal_amount: 0,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: true
      }
    ],
  },
  {
    display_name: "Solana",
    internal_name: "SOLANA_MAINNET",
    native_currency: "SOL",
    logo: "https://cdn.lux.network/bridge/networks/solana_mainnet.png",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:03:07.9874770",
    chain_id: null,
    status: "active",
    type: "solana",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://explorer.solana.com/tx/{0}",
    account_explorer_template: "https://explorer.solana.com/address/{0}",
    node: "https://odella-kzfk20-fast-mainnet.helius-rpc.com/",
    currencies: [
      {
        name: "SOL",
        asset: "SOL",
        contract_address: null,
        logo: "https://cdn.lux.network/bridge/currencies/sol.png",
        decimals: 9,
        status: "active",
        is_deposit_enabled: false,
        is_withdrawal_enabled: false,
        is_refuel_enabled: false,
        max_withdrawal_amount: 0,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: true
      },
      {
        name: "WETH",
        asset: "ETH",
        contract_address: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
        logo: "https://cdn.lux.network/bridge/currencies/ethereum_eth.svg",
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
        is_native: false
      },
      {
        name: "USDC",
        asset: "USDC",
        contract_address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        logo: "https://cdn.lux.network/bridge/currencies/usdc.png",
        decimals: 6,
        status: "active",
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1000,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false
      }
    ],
  },
  {
    display_name: "Ton",
    internal_name: "TON_MAINNET",
    native_currency: "TON",
    logo: "https://cdn.lux.network/bridge/networks/ton_mainnet.svg",
    is_testnet: false,
    is_featured: false,
    average_completion_time: "00:04:39.5276290",
    chain_id: null,
    status: "active",
    type: "ton",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://tonscan.org/tx/{0}",
    account_explorer_template: "https://tonscan.org/address/{0}",
    node: "UQAvirnJ3tWyhjU0At4qRr-Miph3bI_38vgp0h73SHTl3TDB",
    currencies: [
      {
        name: "TON",
        asset: "TON",
        contract_address: null,
        logo: "https://cdn.lux.network/bridge/currencies/ton.svg",
        decimals: 9,
        status: "inactive",
        is_deposit_enabled: false,
        is_withdrawal_enabled: false,
        is_refuel_enabled: false,
        max_withdrawal_amount: 0,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: true
      },
      {
        name: "jUSDC",
        asset: "USDC",
        contract_address: "EQB-MPwrd1G6WKNkLz_VnV6WqBDd142KMQv-g1O-8QUA3728",
        logo: "https://cdn.lux.network/bridge/currencies/usdc.png",
        decimals: 6,
        status: "active",
        is_deposit_enabled: false,
        is_withdrawal_enabled: true,
        is_refuel_enabled: true,
        max_withdrawal_amount: 500,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false
      }
    ]
  },
  {
    display_name: "Lux Testnet",
    internal_name: "LUX_TESTNET",
    native_currency: "LUX",
    logo: "https://cdn.lux.network/bridge/networks/lux_mainnet.png",
    is_testnet: true,
    is_featured: true,
    average_completion_time: "00:00:07.7777777",
    chain_id: 8888,
    status: "active",
    type: "evm",
    refuel_amount_in_usd: 1,
    transaction_explorer_template: "https://explore.lux-test.network/tx/{0}",
    account_explorer_template: "https://explore.lux-test.network/address/{0}",
    node: "https://api.lux-test.network",
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
        contract_address: "0xFdAad51cE3C28bfCCC5217AFddCEFc2a3Da6Ab54",
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