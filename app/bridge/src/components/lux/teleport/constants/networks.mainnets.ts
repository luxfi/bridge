import { type Network } from '@/types/teleport'

export const networks: Network[] = [
  {
    display_name: 'Ethereum',
    internal_name: 'ETHEREUM_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/ethereum_mainnet.png',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:01:04.0494430',
    chain_id: 1,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://etherscan.io/tx/{0}',
    account_explorer_template: 'https://etherscan.io/address/{0}',
    node: 'https://boldest-bold-uranium.quiknode.pro/a5e9ce66d6648e49889274a783acd07aebcc02bc/',
    currencies: [
      {
        name: 'ETH',
        asset: 'ETH',
        logo: 'https://cdn.lux.network/bridge/currencies/ethereum_eth.svg',
        contract_address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        status: 'active',
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
        name: 'USDT',
        asset: 'USDT',
        logo: 'https://cdn.lux.network/bridge/currencies/usdt.png',
        contract_address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        decimals: 6,
        status: 'inactive',
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
        name: 'USDC',
        asset: 'USDC',
        logo: 'https://cdn.lux.network/bridge/currencies/usdc.png',
        contract_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        decimals: 6,
        status: 'inactive',
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
        name: 'DAI',
        asset: 'DAI',
        logo: 'https://cdn.lux.network/bridge/currencies/dai.png',
        contract_address: '0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
        status: 'inactive',
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
    display_name: 'Lux',
    internal_name: 'LUX_MAINNET',
    native_currency: 'LUX',
    logo: 'https://cdn.lux.network/bridge/networks/lux_mainnet.png',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 96369,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://explore.lux.network/tx/{0}',
    account_explorer_template: 'https://explore.lux.network/address/{0}',
    node: 'https://api.lux.network',
    currencies: [
      {
        name: 'LUX',
        asset: 'LUX',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lux.svg',
        contract_address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        status: 'active',
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
        name: 'Lux BTC',
        asset: 'LBTC',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lbtc.svg',
        contract_address: '0x1E48D32a4F5e9f08DB9aE4959163300FaF8A6C8e',
        decimals: 18,
        status: 'active',
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
        name: 'Lux ETH',
        asset: 'LETH',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/leth.svg',
        contract_address: '0x60E0a8167FC13dE89348978860466C9ceC24B9ba',
        decimals: 18,
        status: 'active',
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
        name: 'Lux Dollar',
        asset: 'LUSD',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lusd.svg',
        contract_address: '0x848Cff46eb323f323b6Bbe1Df274E40793d7f2c2',
        decimals: 18,
        status: 'active',
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
        name: 'Lux ZOO',
        asset: 'LZOO',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lzoo.svg',
        contract_address: '0x5E5290f350352768bD2bfC59c2DA15DD04A7cB88',
        decimals: 18,
        status: 'active',
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
        name: 'Lux BNB',
        asset: 'LBNB',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lbnb.svg',
        contract_address: '0x6EdcF3645DeF09DB45050638c41157D8B9FEa1cf',
        decimals: 18,
        status: 'active',
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
        name: 'Lux POL',
        asset: 'LPOL',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lpol.svg',
        contract_address: '0x28BfC5DD4B7E15659e41190983e5fE3df1132bB9',
        decimals: 18,
        status: 'active',
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
        name: 'Lux CELO',
        asset: 'LCELO',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lcelo.svg',
        contract_address: '0x3078847F879A33994cDa2Ec1540ca52b5E0eE2e5',
        decimals: 18,
        status: 'active',
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
        name: 'Lux FTM',
        asset: 'LFTM',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lftm.svg',
        contract_address: '0x8B982132d639527E8a0eAAD385f97719af8f5e04',
        decimals: 18,
        status: 'active',
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
        name: 'Lux xDAI',
        asset: 'LXDAI',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/ldai.svg',
        contract_address: '0x7dfb3cBf7CF9c96fd56e3601FBA50AF45C731211',
        decimals: 18,
        status: 'active',
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
        name: 'Lux SOL',
        asset: 'LSOL',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lsol.svg',
        contract_address: '0x26B40f650156C7EbF9e087Dd0dca181Fe87625B7',
        decimals: 18,
        status: 'active',
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
        name: 'Lux TON',
        asset: 'LTON',
        logo: 'https://cdn.lux.network/bridge/currencies/lux/lton.svg',
        contract_address: '0x3141b94b89691009b950c96e97Bff48e0C543E3C',
        decimals: 18,
        status: 'active',
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      }
    ],
  },
  {
    display_name: 'Zoo',
    internal_name: 'ZOO_MAINNET',
    native_currency: 'ZOO',
    logo: 'https://cdn.lux.network/bridge/networks/zoo_mainnet.svg',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 200200,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://explore.zoo.network/tx/{0}',
    account_explorer_template: 'https://explore.zoo.network/address/{0}',
    node: 'https://api.zoo.network',
    currencies: [
      {
        name: 'ZOO',
        asset: 'ZOO',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo.svg',
        contract_address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo BTC',
        asset: 'ZBTC',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zbtc.svg',
        contract_address: '0x1E48D32a4F5e9f08DB9aE4959163300FaF8A6C8e',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo ETH',
        asset: 'ZETH',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zeth.svg',
        contract_address: '0x60E0a8167FC13dE89348978860466C9ceC24B9ba',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo Dollar',
        asset: 'ZUSD',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zusd.svg',
        contract_address: '0x848Cff46eb323f323b6Bbe1Df274E40793d7f2c2',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo LUX',
        asset: 'ZLUX',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zlux.png',
        contract_address: '0x5E5290f350352768bD2bfC59c2DA15DD04A7cB88',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo BNB',
        asset: 'ZBNB',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zbnb.svg',
        contract_address: '0x6EdcF3645DeF09DB45050638c41157D8B9FEa1cf',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo POL',
        asset: 'ZPOL',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zpol.svg',
        contract_address: '0x28BfC5DD4B7E15659e41190983e5fE3df1132bB9',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo CELO',
        asset: 'ZCELO',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zcelo.svg',
        contract_address: '0x3078847F879A33994cDa2Ec1540ca52b5E0eE2e5',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo FTM',
        asset: 'ZFTM',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zftm.svg',
        contract_address: '0x8B982132d639527E8a0eAAD385f97719af8f5e04',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo xDAI',
        asset: 'ZXDAI',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zdai.svg',
        contract_address: '0x7dfb3cBf7CF9c96fd56e3601FBA50AF45C731211',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo SOL',
        asset: 'ZSOL',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zsol.svg',
        contract_address: '0x26B40f650156C7EbF9e087Dd0dca181Fe87625B7',
        decimals: 18,
        status: 'active',
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
        name: 'Zoo TON',
        asset: 'ZTON',
        logo: 'https://cdn.lux.network/bridge/currencies/zoo/zton.svg',
        contract_address: '0x3141b94b89691009b950c96e97Bff48e0C543E3C',
        decimals: 18,
        status: 'active',
        is_deposit_enabled: true,
        is_withdrawal_enabled: true,
        is_refuel_enabled: false,
        max_withdrawal_amount: 1,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 0.1,
        destination_base_fee: 0.1,
        is_native: false,
      }
    ],
  },
  {
    display_name: 'Base',
    internal_name: 'BASE_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/base_mainnet.png',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 8453,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://basescan.org/tx/{0}',
    account_explorer_template: 'https://basescan.org/address/{0}',
    node: 'https://mainnet.base.org',
    currencies: [
      {
        name: 'ETH',
        asset: 'ETH',
        logo: 'https://cdn.lux.network/bridge/currencies/ethereum_eth.svg',
        contract_address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        status: 'active',
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
        name: 'WETH',
        asset: 'WETH',
        logo: 'https://cdn.lux.network/bridge/currencies/ethereum_eth.svg',
        contract_address: '0x4200000000000000000000000000000000000006',
        decimals: 18,
        status: 'active',
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
        name: 'USDT',
        asset: 'USDT',
        logo: 'https://cdn.lux.network/bridge/currencies/usdt.png',
        contract_address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        decimals: 6,
        status: 'active',
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
        name: 'USDC',
        asset: 'USDC',
        logo: 'https://cdn.lux.network/bridge/currencies/usdc.png',
        contract_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        decimals: 6,
        status: 'active',
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
        name: 'DAI',
        asset: 'DAI',
        logo: 'https://cdn.lux.network/bridge/currencies/dai.png',
        contract_address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        decimals: 18,
        status: 'active',
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
    display_name: 'Optimism',
    internal_name: 'OPTIMISM_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/optimism_mainnet.png',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 10,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://optimistic.etherscan.io/tx/{0}',
    account_explorer_template: 'https://optimistic.etherscan.io//address/{0}',
    node: 'https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7',
    currencies: [
      {
        name: 'ETH',
        asset: 'ETH',
        logo: 'https://cdn.lux.network/bridge/currencies/ethereum_eth.svg',
        contract_address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        status: 'active',
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
        name: 'WETH',
        asset: 'WETH',
        logo: 'https://cdn.lux.network/bridge/currencies/ethereum_eth.svg',
        contract_address: '0x4200000000000000000000000000000000000006',
        decimals: 18,
        status: 'active',
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
        name: 'USDT',
        asset: 'USDT',
        logo: 'https://cdn.lux.network/bridge/currencies/usdt.png',
        contract_address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
        decimals: 6,
        status: 'active',
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
        name: 'USDC',
        asset: 'USDC',
        logo: 'https://cdn.lux.network/bridge/currencies/usdc.png',
        contract_address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
        decimals: 6,
        status: 'active',
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
        name: 'DAI',
        asset: 'DAI',
        logo: 'https://cdn.lux.network/bridge/currencies/dai.png',
        contract_address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
        decimals: 18,
        status: 'active',
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
    display_name: 'Polygon',
    internal_name: 'POLYGON_MAINNET',
    native_currency: 'POL',
    logo: 'https://cdn.lux.network/bridge/networks/polygon_mainnet.png',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 137,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://polygonscan.com/tx/{0}',
    account_explorer_template: 'https://polygonscan.com/address/{0}',
    node: 'https://polygon-bor-rpc.publicnode.com/',
    currencies: [
      {
        name: 'POL',
        asset: 'POL',
        logo: 'https://cdn.lux.network/bridge/currencies/pol.png',
        contract_address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        status: 'active',
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
        name: 'WETH',
        asset: 'WETH',
        logo: 'https://cdn.lux.network/bridge/currencies/ethereum_eth.svg',
        contract_address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        decimals: 18,
        status: 'active',
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
        name: 'USDT',
        asset: 'USDT',
        logo: 'https://cdn.lux.network/bridge/currencies/usdt.png',
        contract_address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        decimals: 6,
        status: 'active',
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
        name: 'USDC',
        asset: 'USDC',
        logo: 'https://cdn.lux.network/bridge/currencies/usdc.png',
        contract_address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
        decimals: 6,
        status: 'active',
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
        name: 'DAI',
        asset: 'DAI',
        logo: 'https://cdn.lux.network/bridge/currencies/dai.png',
        contract_address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
        decimals: 18,
        status: 'active',
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
    display_name: 'Arbitrum One',
    internal_name: 'ARBITRUM_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/arbitrum_mainnet.png',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 42161,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://arbiscan.io/tx/{0}',
    account_explorer_template: 'https://arbiscan.io/address/{0}',
    node: 'https://eth-mainnet.g.alchemy.com/v2/-z4Zrujiou9ajXAplVapFFWWrPuLPSm7',
    currencies: [],
  },
  {
    display_name: 'Celo',
    internal_name: 'CELO_MAINNET',
    native_currency: 'CELO',
    logo: 'https://cdn.lux.network/bridge/networks/celo_mainnet.svg',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 42220,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://celoscan.io/tx/{0}',
    account_explorer_template: 'https://celoscan.io/address/{0}',
    node: 'https://celo.drpc.org',
    currencies: [],
  },

  {
    display_name: 'Binance Smart Chain',
    internal_name: 'BSC_MAINNET',
    native_currency: 'BNB',
    logo: 'https://cdn.lux.network/bridge/networks/bsc_mainnet.png',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 56,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://bscscan.com/tx/{0}',
    account_explorer_template: 'https://bscscan.com/address/{0}',
    node: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
    currencies: [
      {
        name: 'BNB',
        asset: 'BNB',
        logo: 'https://cdn.lux.network/bridge/currencies/bnb.png',
        contract_address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        status: 'active',
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
        name: 'WETH',
        asset: 'WETH',
        logo: 'https://cdn.lux.network/bridge/currencies/ethereum_eth.svg',
        contract_address: '0x7b03a103fc847348e5e59f8d3b0740c48d597973',
        decimals: 18,
        status: 'active',
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
        name: 'USDT',
        asset: 'USDT',
        logo: 'https://cdn.lux.network/bridge/currencies/usdt.png',
        contract_address: '0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3',
        decimals: 6,
        status: 'active',
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
        name: 'USDC',
        asset: 'USDC',
        logo: 'https://cdn.lux.network/bridge/currencies/usdc.png',
        contract_address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
        decimals: 6,
        status: 'active',
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
        name: 'DAI',
        asset: 'DAI',
        logo: 'https://cdn.lux.network/bridge/currencies/dai.png',
        contract_address: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
        decimals: 18,
        status: 'active',
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
    display_name: 'Gnosis',
    internal_name: 'GNOSIS_MAINNET',
    native_currency: 'XDAI',
    logo: 'https://cdn.lux.network/bridge/networks/gnosis_mainnet.png',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 100,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://gnosisscan.io/tx/{0}',
    account_explorer_template: 'https://gnosisscan.io/address/{0}',
    node: 'https://rpc.gnosischain.com',
    currencies: [],
  },
  {
    display_name: 'Avalanche',
    internal_name: 'AVAX_MAINNET',
    native_currency: 'AVAX',
    logo: 'https://cdn.lux.network/bridge/networks/avax_mainnet.png',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 43114,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://snowtrace.io/tx/{0}',
    account_explorer_template: 'https://snowtrace.io/address/{0}',
    node: 'https://api.avax.network/ext/bc/c/rpc',
    currencies: [],
  },
  {
    display_name: 'Fantom',
    internal_name: 'FANTOM_MAINNET',
    native_currency: 'FTM',
    logo: 'https://cdn.lux.network/bridge/networks/fantom_mainnet.svg',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 250,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://ftmscan.io/tx/{0}',
    account_explorer_template: 'https://ftmscan.io/address/{0}',
    node: 'https://rpcapi.fantom.network',
    currencies: [],
  },
  {
    display_name: 'Aurora',
    internal_name: 'AURORA_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/aurora_mainnet.png',
    is_testnet: false,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 1313161554,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://explorer.aurora.dev/tx/{0}',
    account_explorer_template: 'https://explorer.aurora.dev/address/{0}',
    node: 'https://mainnet.aurora.dev',
    currencies: [],
  },
  {
    display_name: 'Zora',
    internal_name: 'ZORA_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/zora_mainnet.png',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 7777777,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://explorer.zora.energy/tx/{0}',
    account_explorer_template: 'https://explorer.zora.energy/address/{0}',
    node: 'https://rpc.zora.energy',
    currencies: [],
  },
  {
    display_name: 'Blast',
    internal_name: 'BLAST_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/blast_mainnet.png',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 81457,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://blastscan.io/tx/{0}',
    account_explorer_template: 'https://blastscan.io/address/{0}',
    node: 'https://rpc.blast.io',
    currencies: [],
  },
  {
    display_name: 'Linea',
    internal_name: 'LINEA_MAINNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/linea_mainnet.png',
    is_testnet: false,
    is_featured: false,
    average_completion_time: '00:01:12.1184390',
    chain_id: 59144,
    status: 'inactive',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://lineascan.build/tx/{0}',
    account_explorer_template: 'https://lineascan.build/address/{0}',
    node: 'https://rpc.linea.build',
    currencies: [],
  }
]
