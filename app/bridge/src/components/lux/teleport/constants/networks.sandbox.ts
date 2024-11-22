import { type Network } from '@/types/teleport'

export const networks: Network[] = [
  {
    display_name: 'Ethereum Sepolia',
    internal_name: 'ETHEREUM_SEPOLIA',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/ethereum_sepolia.png',
    is_testnet: true,
    is_featured: true,
    average_completion_time: '00:01:04.0494430',
    chain_id: 11155111,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://sepolia.etherscan.io/tx/{0}',
    account_explorer_template: 'https://sepolia.etherscan.io/address/{0}',
    node: 'https://old-green-glade.ethereum-sepolia.quiknode.pro/0523b575936957f0e7eae638096d19465aae8f8c/',
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
        contract_address: '0xE9FF4E487ffcA25a765D5445CC8665128Ac35820',
        decimals: 6,
        status: 'active',
        is_deposit_enabled: false,
        is_withdrawal_enabled: false,
        is_refuel_enabled: false,
        max_withdrawal_amount: 0,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 1,
        destination_base_fee: 1,
        is_native: false,
      },
      {
        name: 'USDC',
        asset: 'USDC',
        logo: 'https://cdn.lux.network/bridge/currencies/usdc.png',
        contract_address: '0x299e04DE65090D3C48019893e369A7983124c514',
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
        contract_address: '0x3FADaC51B852273e11Da42Db30714FddA785b8C5',
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
    display_name: 'Holesky Testnet',
    internal_name: 'HOLESKY_TESTNET',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/holesky_testnet.png',
    is_testnet: true,
    is_featured: true,
    average_completion_time: '00:01:04.0494430',
    chain_id: 17000,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://holesky.etherscan.io/tx/{0}',
    account_explorer_template: 'https://holesky.etherscan.io/address/{0}',
    node: 'https://ethereum-holesky-rpc.publicnode.com/',
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
        contract_address: '0xcf963Fe4E4cE126047147661e6e06e171f366506',
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
        contract_address: '0xD257ADA332da217c78959A609e97c71ce5214925',
        decimals: 6,
        status: 'active',
        is_deposit_enabled: false,
        is_withdrawal_enabled: false,
        is_refuel_enabled: false,
        max_withdrawal_amount: 0,
        deposit_fee: 0.1,
        withdrawal_fee: 0.1,
        source_base_fee: 1,
        destination_base_fee: 1,
        is_native: false,
      },
      {
        name: 'USDC',
        asset: 'USDC',
        logo: 'https://cdn.lux.network/bridge/currencies/usdc.png',
        contract_address: '0x15BA7dCA26c63029E33C81f7B3978B54Bc0CB08B',
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
        contract_address: '0x9F47CeB09cb88362f0274Bb354a9807Fd976D963',
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
    display_name: 'Base Sepolia',
    internal_name: 'BASE_SEPOLIA',
    native_currency: 'ETH',
    logo: 'https://cdn.lux.network/bridge/networks/base_mainnet.png',
    is_testnet: true,
    is_featured: true,
    average_completion_time: '00:01:04.0494430',
    chain_id: 84532, //base sepolia
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://sepolia.basescan.org/tx/{0}', // sepolia
    account_explorer_template: 'https://sepolia.basescan.org/address/{0}', // sepolia
    node: 'https://sepolia.base.org', // sepolia
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
        contract_address: '0x46390FA219b22f739C63F0bF1c165a1FBc30B57c',
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
        contract_address: '0xE49355609F94A4B8a2EfC6FBd077542F8EC90080', //sepolia
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
        contract_address: '0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e',
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
    display_name: 'BSC Testnet',
    internal_name: 'BSC_TESTNET',
    native_currency: 'BNB',
    logo: 'https://cdn.lux.network/bridge/networks/bsc_mainnet.png',
    is_testnet: true,
    is_featured: false,
    average_completion_time: '00:01:04.0494430',
    chain_id: 97,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: 'https://testnet.bscscan.com/tx/{0}',
    account_explorer_template: 'https://testnet.bscscan.com/address/{0}',
    node: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
    currencies: [
      {
        name: 'BNB',
        asset: 'BNB',
        logo: 'https://cdn.lux.network/bridge/networks/bsc_mainnet.png',
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
        contract_address: '0x5519582dde6eb1f53F92298622c2ecb39A64369A',
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
        contract_address: '0x6a49DbeD52B9Bd9a53E21C3bCb67dc2697cD6697',
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
        contract_address: '0x2E8A24dE21105772FD161BF56471A0470A8AF45e',
        decimals: 18,
        status: 'active',
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
    display_name: 'Lux Testnet',
    internal_name: 'LUX_TESTNET',
    native_currency: 'LUX',
    logo: 'https://cdn.lux.network/bridge/networks/lux_mainnet.png',
    is_testnet: true,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 96368,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://explore.lux-test.network/tx/{0}',
    account_explorer_template: 'https://explore.lux-test.network/address/{0}',
    node: 'https://api.lux-test.network',
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
    display_name: 'Zoo Testnet',
    internal_name: 'ZOO_TESTNET',
    native_currency: 'ZOO',
    logo: 'https://cdn.lux.network/bridge/networks/zoo_testnet.svg',
    is_testnet: true,
    is_featured: true,
    average_completion_time: '00:00:07.7777777',
    chain_id: 200201,
    status: 'active',
    type: 'evm',
    refuel_amount_in_usd: 1,
    transaction_explorer_template: 'https://explore.zoo-test.network/tx/{0}',
    account_explorer_template: 'https://explore.zoo-test.network/address/{0}',
    node: 'https://api.zoo-test.network',
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
    ]
  },
]
