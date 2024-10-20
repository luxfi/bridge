import { Network } from "@/types/teleport";

export const networks: Network[] = [
  {
    display_name: "Ethereum Sepolia",
    internal_name: "ETHEREUM_SEPOLIA",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/ethereum_sepolia.png",
    is_testnet: true,
    is_featured: true,
    average_completion_time: "00:01:04.0494430",
    chain_id: 11155111,
    status: "active",
    type: "evm",
    refuel_amount_in_usd: 0.5,
    transaction_explorer_template: "https://sepolia.etherscan.io/tx/{0}",
    account_explorer_template: "https://sepolia.etherscan.io/address/{0}",
    node: "https://old-green-glade.ethereum-sepolia.quiknode.pro/0523b575936957f0e7eae638096d19465aae8f8c/",
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
        contract_address: "0xE9FF4E487ffcA25a765D5445CC8665128Ac35820",
        decimals: 6,
        status: "active",
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
        name: "USDC",
        asset: "USDC",
        logo: "https://cdn.lux.network/bridge/currencies/usdc.png",
        contract_address: "0x299e04DE65090D3C48019893e369A7983124c514",
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
        contract_address: "0x3FADaC51B852273e11Da42Db30714FddA785b8C5",
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
    display_name: "Base Sepolia",
    internal_name: "BASE_SEPOLIA",
    native_currency: "ETH",
    logo: "https://cdn.lux.network/bridge/networks/base_mainnet.png",
    is_testnet: true,
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
    display_name: "BSC Testnet",
    internal_name: "BSC_TESTNET",
    native_currency: "BNB",
    logo: "https://cdn.lux.network/bridge/networks/bsc_mainnet.png",
    is_testnet: true,
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
        logo: "https://cdn.lux.network/bridge/networks/bsc_mainnet.png",
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
        name: "Lux BTC",
        asset: "LBTC",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lbtc.svg",
        contract_address: "0xd7bE6F0E47acb95944fcc357a4392cAa5670B9e4",
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
        is_native: false,
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
        logo: "https://cdn.lux.network/bridge/currencies/lux/ldai.svg",
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
        name: "Lux SOL",
        asset: "LSOL",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lsol.svg",
        contract_address: "0x4516dcca0EeE9021A1fe6BBe5deE68B501246Cd1",
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
        is_native: false,
      },
      {
        name: "Lux TON",
        asset: "LTON",
        logo: "https://cdn.lux.network/bridge/currencies/lux/lton.svg",
        contract_address: "0xf41380968E9D408a143ddC63322565793d0750f8",
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
