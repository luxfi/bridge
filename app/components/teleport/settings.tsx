import { Network } from "./types";

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
        status: "active",
        type: "evm",
        refuel_amount_in_usd: 0.5,
        transaction_explorer_template: "https://etherscan.io/tx/{0}",
        account_explorer_template: "https://etherscan.io/address/{0}",
        node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
        currencies: [
            {
                name: "ETH",
                asset: "ETH",
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
                name: "BKT",
                asset: "BKT",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0x9d62526f5Ce701950c30F2cACa70Edf70f9fbf0F",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: false,
                is_withdrawal_enabled: false,
                is_refuel_enabled: false,
                max_withdrawal_amount: 0,
                deposit_fee: 0,
                withdrawal_fee: 0,
                source_base_fee: 0,
                destination_base_fee: 0,
                is_native: false
            },
            {
                name: "ASTR",
                asset: "ASTR",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0x9bBAf650DcD8D3583195715Fc46b1118c3CfDdfd",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: false,
                is_withdrawal_enabled: false,
                is_refuel_enabled: false,
                max_withdrawal_amount: 0,
                deposit_fee: 0,
                withdrawal_fee: 0,
                source_base_fee: 0,
                destination_base_fee: 0,
                is_native: false
            },
            {
                name: "ZKS",
                asset: "ZKS",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xe4815AE53B124e7263F08dcDBBB757d41Ed658c6",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: true,
                is_withdrawal_enabled: false,
                is_refuel_enabled: false,
                max_withdrawal_amount: 10000,
                deposit_fee: 166.865654,
                withdrawal_fee: 65.820981,
                source_base_fee: 26.053974,
                destination_base_fee: 26.053974,
                is_native: false
            },
            {
                name: "USDT",
                asset: "USDT",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
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
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
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
                name: "LRC",
                asset: "LRC",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xbbbbca6a901c926f240b89eacb641d8aec7aeafd",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: true,
                max_withdrawal_amount: 10000,
                deposit_fee: 52.455252,
                withdrawal_fee: 21.830179,
                source_base_fee: 4.435022,
                destination_base_fee: 4.435022,
                is_native: false
            },
            {
                name: "IMX",
                asset: "IMX",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF",
                decimals: 18,
                status: "inactive",
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
            {
                name: "SNX",
                asset: "SNX",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: true,
                max_withdrawal_amount: 500,
                deposit_fee: 6.676014,
                withdrawal_fee: 4.652934,
                source_base_fee: 0.316455,
                destination_base_fee: 0.316455,
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
        chain_id: 56,
        status: "inactive",
        type: "evm",
        refuel_amount_in_usd: 0.5,
        transaction_explorer_template: "https://etherscan.io/tx/{0}",
        account_explorer_template: "https://etherscan.io/address/{0}",
        node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
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
                name: "BKT",
                asset: "BKT",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0x9d62526f5Ce701950c30F2cACa70Edf70f9fbf0F",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: false,
                is_withdrawal_enabled: false,
                is_refuel_enabled: false,
                max_withdrawal_amount: 0,
                deposit_fee: 0,
                withdrawal_fee: 0,
                source_base_fee: 0,
                destination_base_fee: 0,
                is_native: false
            },
            {
                name: "ASTR",
                asset: "ASTR",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0x9bBAf650DcD8D3583195715Fc46b1118c3CfDdfd",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: false,
                is_withdrawal_enabled: false,
                is_refuel_enabled: false,
                max_withdrawal_amount: 0,
                deposit_fee: 0,
                withdrawal_fee: 0,
                source_base_fee: 0,
                destination_base_fee: 0,
                is_native: false
            },
            {
                name: "ZKS",
                asset: "ZKS",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xe4815AE53B124e7263F08dcDBBB757d41Ed658c6",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: true,
                is_withdrawal_enabled: false,
                is_refuel_enabled: false,
                max_withdrawal_amount: 10000,
                deposit_fee: 166.865654,
                withdrawal_fee: 65.820981,
                source_base_fee: 26.053974,
                destination_base_fee: 26.053974,
                is_native: false
            },
            {
                name: "USDT",
                asset: "USDT",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
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
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
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
                name: "LRC",
                asset: "LRC",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xbbbbca6a901c926f240b89eacb641d8aec7aeafd",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: true,
                max_withdrawal_amount: 10000,
                deposit_fee: 52.455252,
                withdrawal_fee: 21.830179,
                source_base_fee: 4.435022,
                destination_base_fee: 4.435022,
                is_native: false
            },
            {
                name: "IMX",
                asset: "IMX",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF",
                decimals: 18,
                status: "inactive",
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
            {
                name: "SNX",
                asset: "SNX",
                logo: "https://cdn.lux.network/bridge/networks/ethereum_mainnet.png",
                contract_address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
                decimals: 18,
                status: "inactive",
                is_deposit_enabled: true,
                is_withdrawal_enabled: true,
                is_refuel_enabled: true,
                max_withdrawal_amount: 500,
                deposit_fee: 6.676014,
                withdrawal_fee: 4.652934,
                source_base_fee: 0.316455,
                destination_base_fee: 0.316455,
                is_native: false
            }
        ]
    },
    {
        display_name: "BASE",
        internal_name: "BASE_MAINNET",
        native_currency: "ETH",
        logo: "https://cdn.lux.network/bridge/networks/base_mainnet.png",
        is_testnet: false,
        is_featured: false,
        average_completion_time: "00:01:04.0494430",
        chain_id: 56,
        status: "inactive",
        type: "evm",
        refuel_amount_in_usd: 0.5,
        transaction_explorer_template: "https://etherscan.io/tx/{0}",
        account_explorer_template: "https://etherscan.io/address/{0}",
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
        chain_id: 56,
        status: "inactive",
        type: "evm",
        refuel_amount_in_usd: 0.5,
        transaction_explorer_template: "https://etherscan.io/tx/{0}",
        account_explorer_template: "https://etherscan.io/address/{0}",
        node: "https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7",
        currencies: []
    },

]