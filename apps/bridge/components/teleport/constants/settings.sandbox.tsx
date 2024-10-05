import { Network } from "@/types/teleport";

export const networks: Network[] = [
    {
        display_name: "Ethereum",
        internal_name: "ETHEREUM_MAINNET",
        native_currency: "ETH",
        logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
        is_testnet: false,
        is_featured: true,
        average_completion_time: "00:01:04.0494430",
        chain_id: 84532, //base sepolia
        status: "active",
        type: "evm",
        refuel_amount_in_usd: 0.5,
        transaction_explorer_template: "https://sepolia.basescan.org/tx/{0}", // sepolia
        account_explorer_template: "https://sepolia.basescan.org/address/{0}", // sepolia
        node: "https://sepolia.base.org", // sepolia
        currencies: [
            {
                name: "ETH",
                asset: "ETH",
                logo: "https://cdn.lux.network/bridge/currencies/eth.png",
                contract_address: null,
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: true
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
                deposit_fee: 4.68,
                withdrawal_fee: 2.24,
                source_base_fee: 1,
                destination_base_fee: 1,
                is_native: false
            },
            {
                name: "USDC",
                asset: "USDC",
                logo: "https://cdn.lux.network/bridge/currencies/usdc.png",
                contract_address: "0xE49355609F94A4B8a2EfC6FBd077542F8EC90080",//sepolia
                decimals: 6,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: true,
                max_withdrawal_amount: 3000,
                deposit_fee: 12.79,
                withdrawal_fee: 6.4,
                source_base_fee: 0.99,
                destination_base_fee: 0.99,
                is_native: false
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
                deposit_fee: 12.79,
                withdrawal_fee: 6.4,
                source_base_fee: 0.99,
                destination_base_fee: 0.99,
                is_native: false
            }
        ]
    },
    {
        display_name: "POLYGON",
        internal_name: "POLYGON_MAINNET",
        native_currency: "POL",
        logo: "https://cdn.lux.network/bridge/networks/polygon_mainnet.png",
        is_testnet: false,
        is_featured: true,
        average_completion_time: "00:00:07.7777777",
        chain_id: 137,
        status: "inactive",
        type: "evm",
        refuel_amount_in_usd: 1,
        transaction_explorer_template: "https://https://polygonscan.com/tx/{0}",
        account_explorer_template: "https://https://polygonscan.com/address/{0}",
        node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
        currencies: []
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
        transaction_explorer_template: "https://https://optimistic.etherscan.io/tx/{0}",
        account_explorer_template: "https://https://optimistic.etherscan.io//address/{0}",
        node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
        currencies: []
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
        currencies: []
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
        currencies: []
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
        currencies: [
            {
                name: "ETH",
                asset: "ETH",
                logo: "https://cdn.lux.network/bridge/currencies/eth.png",
                contract_address: null,
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: true
            },
            {
                name: "USDT",
                asset: "USDT",
                logo: "https://cdn.lux.network/bridge/currencies/usdt.png",
                contract_address: "0xa92E09451140d645A2fE262c9631Dd808439dDEd",// sepolia
                decimals: 6,
                status: "active",
                is_deposit_enabled: false,
                is_withdrawal_enabled: false,
                is_refuel_enabled: false,
                max_withdrawal_amount: 0,
                deposit_fee: 4.68,
                withdrawal_fee: 2.24,
                source_base_fee: 1,
                destination_base_fee: 1,
                is_native: false
            },
            {
                name: "USDC",
                asset: "USDC",
                logo: "https://cdn.lux.network/bridge/currencies/usdc.png",
                contract_address: "0xB587bAb3d507d720625D30544C2889D661446BF7",//sepolia
                decimals: 6,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: true,
                max_withdrawal_amount: 3000,
                deposit_fee: 12.79,
                withdrawal_fee: 6.4,
                source_base_fee: 0.99,
                destination_base_fee: 0.99,
                is_native: false
            },
            {
                name: "DAI",
                asset: "DAI",
                logo: "https://cdn.lux.network/bridge/currencies/dai.png",
                contract_address: "0x7390C3FA8576a0E9E7c788cc7955c3151c4c1612",
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: true,
                max_withdrawal_amount: 3000,
                deposit_fee: 12.79,
                withdrawal_fee: 6.4,
                source_base_fee: 0.99,
                destination_base_fee: 0.99,
                is_native: false
            }
        ]
    },
    {
        display_name: "Binance Smart Chain",
        internal_name: "BSC_MAINNET",
        native_currency: "BNB",
        logo: "https://cdn.lux.network/bridge/networks/bsc_mainnet.png",
        is_testnet: false,
        is_featured: false,
        average_completion_time: "00:01:04.0494430",
        chain_id: 97,
        status: "active",
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
                contract_address: null,
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: true
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
                deposit_fee: 4.68,
                withdrawal_fee: 2.24,
                source_base_fee: 1,
                destination_base_fee: 1,
                is_native: false
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
                deposit_fee: 12.79,
                withdrawal_fee: 6.4,
                source_base_fee: 0.99,
                destination_base_fee: 0.99,
                is_native: false
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
                deposit_fee: 6.377331,
                withdrawal_fee: 2.65567,
                source_base_fee: 0.555555,
                destination_base_fee: 0.555555,
                is_native: false
            },
        ]
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
        currencies: []
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
        currencies: []
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
        currencies: []
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
        currencies: []
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
        currencies: []
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
        currencies: []
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
        currencies: []
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
        status: "active",
        type: "evm",
        refuel_amount_in_usd: 1,
        transaction_explorer_template: "https://explore.lux.network/tx/{0}",
        account_explorer_template: "https://explore.lux.network/address/{0}",
        node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
        currencies: [
            {
                name: "LUX",
                asset: "LUX",
                logo: "https://cdn.lux.network/bridge/networks/lux_mainnet.png",
                contract_address: null,
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: true
            },
            {
                name: "LETH",
                asset: "LETH",
                logo: "https://cdn.lux.network/bridge/networks/lux_mainnet.png",
                contract_address: "0xD4A215472332e8B6E26B0a5DC253DB78119904cA",
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: false
            },
            {
                name: "LPOL",
                asset: "LPOL",
                logo: "https://cdn.lux.network/bridge/currencies/polygon.png",
                contract_address: "0xD4A215472332e8B6E26B0a5DC253DB78119904cA",
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: false
            },
            {
                name: "LBNB",
                asset: "LBNB",
                logo: "https://cdn.lux.network/bridge/currencies/bnb.png",
                contract_address: "0xD4A215472332e8B6E26B0a5DC253DB78119904cA",
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: false
            },
            {
                name: "LFTM",
                asset: "LFTM",
                logo: "https://cdn.lux.network/bridge/currencies/ftm.svg",
                contract_address: "0xD4A215472332e8B6E26B0a5DC253DB78119904cA",
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: false
            },
            {
                name: "LUSD",
                asset: "LUSD",
                logo: "https://cdn.lux.network/bridge/currencies/lusd.png",
                contract_address: "0xc16ECFE3cB80e142d7110b97a442d4caAA203ABf",
                decimals: 18,
                status: "active",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: false,
                max_withdrawal_amount: 1,
                deposit_fee: 0.001462,
                withdrawal_fee: 0.001462,
                source_base_fee: 0.000456,
                destination_base_fee: 0.000456,
                is_native: false
            },
        ]
    },
]

export const CONTRACTS = {
    11155111: {
        teleporter: "0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e",
    },
    7777: {
        teleporter: "0xB2237fb7DBB19Ff09BBD64029064eC05B3C369Ac"
    }
}

export const SWAP_PAIRS: Record<string, string[]> = {
    "LETH": ["ETH"],
    "LPOL": ["POL", "MATIC"],
    "LBNB": ["BNB"],
    "LFTM": ["FTM"],
    "LCELO": ["CELO"],
    "LUSD": ["USDT", "USDC", "DAI"],

    "ETH": ["LETH"],
    "POL": ["LPOL"],
    "BNB": ["LBNB"],
    "FTM": ["LFTM"],
    "CELO": ["LCELO"],
    "USDT": ["LUSD"],
    "USDC": ["LUSD"],
    "DAI": ["LUSD"],
}
