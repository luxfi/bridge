import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import dotenv from 'dotenv';

dotenv.config();

const PRIVATE_KEY: string = process.env.PRIVATE_KEY!;
const SEPOLIA_RPC: string = process.env.SEPOLIA_RPC!;
const BASE_RPC: string = process.env.BASE_RPC!;
const BSC_TESTNET_RPC: string = process.env.BSC_TESTNET_RPC!;
const LUX_MAINNET_RPC: string = process.env.LUX_MAINNET_RPC!;
const LUX_TESTNET_RPC: string = process.env.LUX_TESTNET_RPC!;

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    bsc_testnet: {
      url: BSC_TESTNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    base: {
      url: BASE_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    lux: {
      url: LUX_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    "lux-test": {
      url: LUX_TESTNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`]
    }
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY!,
      bsc: process.env.BSCSCAN_API_KEY!,
      bscTestnet: process.env.BSCSCAN_API_KEY!,
      lux: "your API key", // Leave empty if not applicable
      "lux-test": "your API key" // Leave empty if not applicable
    },
    customChains: [
      {
        network: "lux",
        chainId: 7777,
        urls: {
          apiURL: "https://api.explore.lux.network/api",
          browserURL: "https://explore.lux.network"
        }
      },
      {
        network: "lux-test",
        chainId: 8888,
        urls: {
          apiURL: "https://api.explore.lux-test.network/api",
          browserURL: "https://explore.lux-test.network"
        }
      },
    ]
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
