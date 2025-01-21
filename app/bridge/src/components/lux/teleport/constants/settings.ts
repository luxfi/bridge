export const CONTRACTS = {
  96369: {
    name: 'LUX_MAINNET',
    chain_id: 96369,
    teleporter: '0x9012A4162deA268F6a9e475b78B33f20127158E3',
    vault: '0xf1Adba64335af4E80fFe9A3a6b6Dc2f1e1cBb4CB',
  },
  200200: {
    name: 'ZOO_MAINNET',
    chain_id: 200200,
    teleporter: '0x9012A4162deA268F6a9e475b78B33f20127158E3',
    vault: '0xf1Adba64335af4E80fFe9A3a6b6Dc2f1e1cBb4CB',
  },
  1: {
    name: 'ETHEREUM_MAINNET',
    chain_id: 1,
    teleporter: '0xebD1Ee9BCAaeE50085077651c1a2dD452fc6b72e',
    vault: '0xcf963Fe4E4cE126047147661e6e06e171f366506',
  },
  137: {
    name: 'POLYGON_MAINNET',
    chain_id: 137,
    teleporter: '0xE09C9b6Ed2BADAa97AB00652dF75da05adc6dAeF',
    vault: '0x217feE2a1a6A31Dda68433270531F56C91EC8D2B',
  },
  10: {
    name: 'OPTIMISM_MAINNET',
    chain_id: 10,
    teleporter: '0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95',
    vault: '0x37d9fB96722ebDDbC8000386564945864675099B',
  },
  42161: {
    name: 'ARBITRUM_MAINNET',
    chain_id: 42161,
    teleporter: '0xA60429080752484044e529012aA46e1D691f50Ab',
    vault: '0xE6e3E18F86d5C35ec1E24c0be8672c8AA9989258',
  },
  42220: {
    name: 'CELO_MAINNET',
    chain_id: 42220,
    teleporter: '0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95',
    vault: '0x37d9fB96722ebDDbC8000386564945864675099B',
  },
  8453: {
    name: 'BASE_MAINNET',
    chain_id: 8453,
    teleporter: '0x37d9fB96722ebDDbC8000386564945864675099B',
    vault: '0x3226bb1d3055685EFC1b0E49718B909a1c6Ce18d',
  },
  56: {
    name: 'BSC_MAINNET',
    chain_id: 56,
    teleporter: '0xebD1Ee9BCAaeE50085077651c1a2dD452fc6b72e',
    vault: '0xcf963Fe4E4cE126047147661e6e06e171f366506',
  },
  43114: {
    name: 'AVAX_MAINNET',
    chain_id: 43114,
    teleporter: '0x3226bb1d3055685EFC1b0E49718B909a1c6Ce18d',
    vault: '0x6149D8C44Ec9a4a683d14E494a73B1b11ac331A8',
  },
  7777777: {
    name: 'ZORA_MAINNET',
    chain_id: 7777777,
    teleporter: '0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95',
    vault: '0x37d9fB96722ebDDbC8000386564945864675099B',
  },
  81457: {
    name: 'BLAST_MAINNET',
    chain_id: 81457,
    teleporter: '0xbdCE894aEd7d30BA0C0D0B51604ee9d225fc8b95',
    vault: '0x37d9fB96722ebDDbC8000386564945864675099B',
  },
  59144: {
    name: 'LINEA_MAINNET',
    chain_id: 59144,
    teleporter: '0x1e48d32a4f5e9f08db9ae4959163300faf8a6c8e',
    vault: '0x3226bb1d3055685EFC1b0E49718B909a1c6Ce18d',
  },
  100: {
    name: 'GNOSIS_MAINNET',
    chain_id: 100,
    teleporter: '',
    vault: '',
  },
  250: {
    name: 'FANTOM_MAINNET',
    chain_id: 250,
    teleporter: '',
    vault: '',
  },
  1313161554: {
    name: 'AURORA_MAINNET',
    chain_id: 1313161554,
    teleporter: '',
    vault: '',
  },
  ///////////////////////////////////////// testnets ///////////////////////////////////////////
  11155111: {
    name: 'ETHEREUM_SEPOLIA',
    chain_id: 11155111,
    teleporter: '0xb34e8a93A56De724c432fD41052E715657Fb0B1D',
    vault: '0x63139CFe43cEe881332a2264851940108333e8D0',
  },
  17000: {
    name: 'HOLESKY_TESTNET',
    chain_id: 17000,
    teleporter: '0x2951A9386df11a4EA8ae5A823B94DC257dEb35Cb',
    vault: '0xebD1Ee9BCAaeE50085077651c1a2dD452fc6b72e',
  },
  84532: {
    name: 'BASE_SEPOLIA',
    chain_id: 84532,
    teleporter: '0xE139056397091c15F860E94b20cCc169520b086A',
    vault: '0x2c4908f1B607A4448272ea29A054bf9AA08A1D76',
  },
  97: {
    name: 'BSC_TESTNET',
    chain_id: 97,
    teleporter: '0xD293337c79A951C0e93aEb6a5E255097d65b671f',
    vault: '0xe0feC703840364714b97272973B8945FD5eB5600',
  },
  96368: {
    name: 'LUX_TESTNET',
    chain_id: 96368,
    teleporter: '0x5B562e80A56b600d729371eB14fE3B83298D0642',
    vault: '0x08c0f48517C6d94Dd18aB5b132CA4A84FB77108e',
  },
  200201: {
    name: 'ZOO_TESTNET',
    chain_id: 200201,
    teleporter: '0x5B562e80A56b600d729371eB14fE3B83298D0642',
    vault: '0x08c0f48517C6d94Dd18aB5b132CA4A84FB77108e',
  },
}

export const SWAP_PAIRS: Record<string, string[]> = {
  // Lux tokens
  LUX: ['ZLUX'],
  LBTC: ['WBTC', 'ZBTC', 'cbBTC'],
  LETH: ['ETH', 'WETH', 'ZETH'],
  LUSD: ['USDT', 'USDC', 'DAI', 'ZUSD'],
  LZOO: ['ZOO'],
  LBNB: ['BNB', 'ZBNB'],
  LPOL: ['POL', 'ZPOL'],
  LCELO: ['CELO', 'ZCELO'],
  LFTM: ['FTM', 'ZFTM'],
  LXDAI: ['XDAI', 'ZXDAI'],
  LSOL: ['ZSOL'],
  LTON: ['ZTON'],
  LADA: ['ZADA'],
  LAVAX: ['AVAX', 'ZAVAX'],
  LBLAST: ['ZBLAST', 'BLAST'],
  LBONK: ['ZBONK'],
  LWIF: ['ZWIF'],
  LPOPCAT: ['ZPOPCAT'],
  LPNUT: ['ZPNUT'],
  LMEW: ['ZMEW'],
  LBOME: ['ZBOME'],
  LGIGA: ['ZGIGA'],
  LAI16Z: ['ZAI16Z'],
  LFWOG: ['ZFWOG'],
  LMOODENG: ['ZMOODENG'],
  LPONKE: ['ZPONKE'],
  LNOT: ['ZNOT'],
  LDOGS: ['ZDOGS'],
  LMRB: ['ZMRB'],
  LREDO: ['ZREDO'],
  // Zoo tokens
  ZOO: ['LZOO'],
  ZBTC: ['WBTC', 'LBTC'],
  ZETH: ['ETH', 'WETH', 'LETH'],
  ZUSD: ['USDT', 'USDC', 'DAI', 'LUSD'],
  ZLUX: ['LUX'],
  ZBNB: ['BNB', 'LBNB'],
  ZPOL: ['POL', 'LPOL'],
  ZCELO: ['CELO', 'LCELO'],
  ZFTM: ['FTM', 'LFTM'],
  ZXDAI: ['XDAI', 'LXDAI'],
  ZSOL: ['LSOL'],
  ZTON: ['LTON'],
  ZADA: ['LADA'],
  ZAVAX: ['AVAX', 'LAVAX'],
  ZBLAST: ['LBLAST', 'BLAST'],
  ZBONK: ['LBONK'],
  ZWIF: ['LWIF'],
  ZPOPCAT: ['LPOPCAT'],
  ZPNUT: ['LPNUT'],
  ZMEW: ['LMEW'],
  ZBOME: ['LBOME'],
  ZGIGA: ['LGIGA'],
  ZAI16Z: ['LAI16Z'],
  ZFWOG: ['LFWOG'],
  ZMOODENG: ['LMOODENG'],
  ZPONKE: ['LPONKE'],
  ZNOT: ['LNOT'],
  ZDOGS: ['LDOGS'],
  ZMRB: ['LMRB'],
  ZREDO: ['LREDO'],
  // Evm tokens
  ETH: ['LETH', 'ZETH'],
  WETH: ['LETH', 'ZETH'],
  cbBTC: ['LBTC', 'ZBTC'],
  WBTC: ['LBTC', 'ZBTC'],
  POL: ['LPOL', 'ZPOL'],
  BNB: ['LBNB', 'ZBNB'],
  FTM: ['LFTM', 'ZFTM'],
  DAI: ['LUSD', 'ZUSD'],
  USDT: ['LUSD', 'ZUSD'],
  USDC: ['LUSD', 'ZUSD'],
  CELO: ['LCELO', 'ZCELO'],
  XDAI: ['LXDAI', 'ZXDAI'],
  AVAX: ['LAVAX', 'ZAVAX'],
  BLAST: ['LBLAST', 'ZBLAST'],
  //// Utila tokens
  BTC: ['LBTC', 'ZBTC'],
  TON: ['LTON', 'ZTON'],
  // Solana tokens
  SOL: ['LSOL', 'ZSOL'],
  BONK: ['LBONK', 'ZBONK'],
  SIXR: ['LSIXR', 'ZSIXR'],
  WIF: ['LWIF', 'ZWIF'],
  POPCAT: ['LPOPCAT', 'ZPOPCAT'],
  PNUT: ['LPNUT', 'ZPNUT'],
  MEW: ['LMEW', 'ZMEW'],
  BOME: ['LBOME', 'ZBOME'],
  GIGA: ['LGIGA', 'ZGIGA'],
  AI16Z: ['LAI16Z', 'ZAI16Z'],
  FWOG: ['LFWOG', 'ZFWOG'],
  MOODENG: ['LMOODENG', 'ZMOODENG'],
  PONKE: ['LPONKE', 'ZPONKE'],
  SLOG: ['SLOG'],
  MELANIA: ['MELANIA'],
  TRUMP: ['TRUMP'],
  Z: ['Z'],
  CYRUS: ['CYRUS'],
  // Ton tokens
  NOT: ['LNOT', 'ZNOT'],
  DOGS: ['LDOGS', 'ZDOGS'],
  MRB: ['LMRB', 'ZMRB'],
  REDO: ['LREDO', 'ZREDO'],
}
