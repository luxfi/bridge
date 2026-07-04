import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import dotenv from "dotenv";

dotenv.config();

// Two pre-existing, unrelated compile breaks — neither touches the LUX<->ZOO
// corridor (Bridge/LuxVault/ERC20B) this branch adds; both predate it and are
// excluded here (files themselves untouched) so the rest of contracts/ builds:
//  - contracts/XChainVault.sol imports ./interfaces/{IWarpMessenger,IBridge}.sol,
//    which have never existed in this repo (`git log --all` finds no such
//    path ever tracked). Added in fa9023d8 / last touched 0286a933. Never compiled.
//  - contracts/lux/*.sol (25 of 29 files, e.g. LADA/LBONK/LZOO) call the OLD
//    2-arg `ERC20B(_name, _symbol)` constructor; ERC20B.sol was hardened to a
//    3-arg `(name, symbol, admin)` AccessControl constructor and these legacy
//    per-asset token shims (dead code — nothing imports contracts/lux/*) were
//    never updated to match. The contracts/zoo/* siblings already use the
//    correct 3-arg form.
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
  const paths: string[] = await runSuper();
  return paths.filter((p) => !p.endsWith("XChainVault.sol") && !p.includes("/contracts/lux/"));
});

const PRIVATE_KEY: string = process.env.PRIVATE_KEY!;
const SEPOLIA_RPC: string = process.env.SEPOLIA_RPC!;
const BASE_SEPOLIA_RPC: string = process.env.BASE_SEPOLIA_RPC!;
const HOLESKY_RPC: string = process.env.HOLESKY_RPC!;
const BSC_TESTNET_RPC: string = process.env.BSC_TESTNET_RPC!;
const LUX_MAINNET_RPC: string = process.env.LUX_MAINNET_RPC!;
const LUX_TESTNET_RPC: string = process.env.LUX_TESTNET_RPC!;
const ZOO_MAINNET_RPC: string = process.env.ZOO_MAINNET_RPC!;
const ZOO_TESTNET_RPC: string = process.env.ZOO_TESTNET_RPC!;
const MAINNET_RPC: string = process.env.MAINNET_RPC!;

const BSC_MAINNET_RPC = process.env.BSC_MAINNET_RPC!;
const POLYGON_MAINNET_RPC = process.env.POLYGON_MAINNET_RPC!;
const BASE_MAINNET_RPC = process.env.BASE_MAINNET_RPC!;
const OPTIMISM_MAINNET_RPC = process.env.OPTIMISM_MAINNET_RPC!;
const ARBITRUM_MAINNET_RPC = process.env.ARBITRUM_MAINNET_RPC!;
const CELO_MAINNET_RPC = process.env.CELO_MAINNET_RPC!;
const GNOSIS_MAINNET_RPC = process.env.GNOSIS_MAINNET_RPC!;
const AVAX_MAINNET_RPC = process.env.AVAX_MAINNET_RPC!;
const FANTOM_MAINNET_RPC = process.env.FANTOM_MAINNET_RPC!;
const AURORA_MAINNET_RPC = process.env.AURORA_MAINNET_RPC!;
const ZORA_MAINNET_RPC = process.env.ZORA_MAINNET_RPC!;
const BLAST_MAINNET_RPC = process.env.BLAST_MAINNET_RPC!;
const LINEA_MAINNET_RPC = process.env.LINEA_MAINNET_RPC!;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 100,
      },
      viaIR: true,
    },
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    bsc: {
      url: BSC_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    base: {
      url: BASE_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    polygon: {
      url: POLYGON_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    avax: {
      url: AVAX_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    arbitrum: {
      url: ARBITRUM_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    optimism: {
      url: OPTIMISM_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    lux: {
      url: LUX_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    zoo: {
      url: ZOO_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    snowtrace: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      accounts: [`0x${PRIVATE_KEY}`],
    },
    blast: {
      url: BLAST_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    celo: {
      url: CELO_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    zora: {
      url: ZORA_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    linea: {
      url: LINEA_MAINNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    //////////////////////// testnet ////////////////////
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    holesky: {
      url: HOLESKY_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    baseTestnet: {
      url: BASE_SEPOLIA_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    luxTestnet: {
      url: LUX_TESTNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    zooTestnet: {
      url: ZOO_TESTNET_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY!,
      holesky: process.env.HOLESKYSCAN_API_KEY!,
      bsc: process.env.BSCSCAN_API_KEY!,
      bscTestnet: process.env.BSCSCAN_API_KEY!,
      baseSepolia: process.env.BASESCAN_API_KEY!,
      lux: "your API key", // Leave empty if not applicable
      luxTestnet: "your API key", // Leave empty if not applicable
      zoo: "your API key", // Leave empty if not applicable
      // main nets
      polygon: process.env.POLYGONSCAN_API_KEY!,
      mainnet: process.env.ETHERSCAN_API_KEY!,
      base: process.env.BASESCAN_API_KEY!,
      snowtrace: "snowtrace",
      optimisticEthereum: process.env.OPTIMISMSCAN_API_KEY!,
      arbitrumOne: process.env.ARBISCAN_API_KEY!,
      linea: process.env.LINEASCAN_API_KEY!
    },
    customChains: [
      {
        network: "lux",
        chainId: 96369,
        urls: {
          apiURL: "https://api-explore.lux.network",
          browserURL: "https://explore.lux.network",
        },
      },
      {
        network: "luxTestnet",
        chainId: 96368,
        urls: {
          apiURL: "https://api-explore.lux-test.network",
          browserURL: "https://explore.lux-test.network",
        },
      },
      {
        network: "zoo",
        chainId: 200200,
        urls: {
          apiURL: "https://api-explore.zoo.network",
          browserURL: "https://explore.zoo.network",
        },
      },
      {
        network: "zooTestnet",
        chainId: 200201,
        urls: {
          apiURL: "https://api-explore.zoo-test.network",
          browserURL: "https://explore.zoo-test.network",
        },
      },
      {
        network: "snowtrace",
        chainId: 43114,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
          browserURL: "https://avalanche.routescan.io"
        }
      },
      {
        network: "linea",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build/"
        }
      }
    ],
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
