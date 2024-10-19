export const CONTRACTS = {
  1: {
    chain_id: 1,
    teleporter: "",
    vault: "",
  },
  137: {
    chain_id: 137,
    teleporter: "",
    vault: "",
  },
  10: {
    chain_id: 10,
    teleporter: "",
    vault: "",
  },
  42161: {
    chain_id: 42161,
    teleporter: "",
    vault: "",
  },
  42220: {
    chain_id: 42220,
    teleporter: "",
    vault: "",
  },
  8453: {
    chain_id: 8453,
    teleporter: "",
    vault: "",
  },
  100: {
    chain_id: 100,
    teleporter: "",
    vault: "",
  },
  43114: {
    chain_id: 43114,
    teleporter: "",
    vault: "",
  },
  250: {
    chain_id: 250,
    teleporter: "",
    vault: "",
  },
  1313161554: {
    chain_id: 1313161554,
    teleporter: "",
    vault: "",
  },
  7777777: {
    chain_id: 7777777,
    teleporter: "",
    vault: "",
  },
  81457: {
    chain_id: 81457,
    teleporter: "",
    vault: "",
  },
  59144: {
    chain_id: 59144,
    teleporter: "",
    vault: "",
  },
  ///////////////////////////////////////// testnets ///////////////////////////////////////////
  11155111: {
    // sepolia
    chain_id: 11155111,
    teleporter: "0xb34e8a93A56De724c432fD41052E715657Fb0B1D",
    vault: "0x63139CFe43cEe881332a2264851940108333e8D0",
  },
  84532: {
    // base sepolia
    chain_id: 84532,
    teleporter: "0xE139056397091c15F860E94b20cCc169520b086A",
    vault: "0x2c4908f1B607A4448272ea29A054bf9AA08A1D76",
  },
  97: {
    // bsc testnet
    chain_id: 97,
    teleporter: "0xD293337c79A951C0e93aEb6a5E255097d65b671f",
    vault: "0xe0feC703840364714b97272973B8945FD5eB5600",
  },
  8888: {
    // lux testnet
    chain_id: 8888,
    teleporter: "0x7d462c69057E404a172690E8C5021563382CAa78",
    vault: "0xD1496b961855c3F554F3F71A653915EEe035c55e",
  },
  
  
};

export const SWAP_PAIRS: Record<string, string[]> = {
  LETH: ["ETH"],
  LBNB: ["BNB"],
  LFTM: ["FTM"],
  LPOL: ["POL", "MATIC"],
  LUSD: ["USDT", "USDC", "DAI"],
  LCELO: ["CELO"],
  LXDAI: ["XDAI"],

  ETH: ["LETH"],
  POL: ["LPOL"],
  BNB: ["LBNB"],
  FTM: ["LFTM"],
  DAI: ["LUSD"],
  USDT: ["LUSD"],
  USDC: ["LUSD"],
  CELO: ["LCELO"],
  XDAI: ["LXDAI"],
};
