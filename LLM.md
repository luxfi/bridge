# Lux Network MPC Bridge Architecture

This document provides a comprehensive overview of the Lux Network MPC Bridge project, its components, and how they interact.

## Project Overview

The Lux Network Bridge is a decentralized cross-chain bridge that uses Multi-Party Computation (MPC) to enable secure asset transfers between different blockchain networks. The bridge consists of several key components:

1. **Smart Contracts**: EVM-compatible contracts deployed on various networks
2. **MPC Nodes**: Distributed nodes that use threshold signatures for secure transaction signing
3. **Bridge UI**: Web interface for users to initiate cross-chain transfers
4. **Backend Services**: APIs and services that coordinate the bridge operations
5. **Blockchain Monitors**: Services that monitor different blockchains (EVM and non-EVM) for events

## Project Structure

The project is organized as a monorepo with the following main directories:

- `app/`: Frontend applications
  - `bridge/`: Main bridge UI application (Next.js)
  - `bridge3/`: New version of the bridge UI
  - `explorer/`: Block explorer UI
  - `server/`: Backend API services
- `contracts/`: Smart contracts for the bridge
  - `contracts/`: Solidity smart contracts for various chains
  - `ignition/`: Deployment modules for the contracts
  - `scripts/`: Utility scripts for contract interactions
- `mpc-nodes/`: MPC node implementation
  - `docker/`: Docker configuration for running MPC nodes
  - `k8s.examples/`: Kubernetes deployment examples
- `pkg/`: Shared packages and utilities
  - `luxfi-core/`: Core shared types and utilities
  - `settings/`: Configuration settings
  - `utila/`: Utility functions and helpers

## Key Components

### Smart Contracts

The bridge uses several key smart contracts:

1. **Bridge.sol**: The main contract that handles the teleport operations, including minting, burning, and vault interactions.
2. **ERC20B.sol**: Bridgeable ERC20 token implementation that supports the bridge-specific operations.
3. **LuxVault.sol**: Vault contract that securely holds tokens during the bridging process.
4. **ETHVault.sol**: Specialized vault for handling native ETH.

The contracts support multiple blockchain networks, including:
- Ethereum (mainnet and testnets)
- BSC (Binance Smart Chain)
- Lux Network
- Zoo Network
- Base
- Polygon
- Avalanche
- XRP Ledger (XRPL)
- Many other EVM-compatible chains

### MPC Nodes

The MPC (Multi-Party Computation) nodes are a distributed network of servers that collectively sign transactions without any single node having access to the complete private key. Key features:

1. **Decentralized oracle operations using MPC**
2. **Decentralized permissioning using MPC**
3. **Zero-knowledge transactions**: Signers don't know details about assets being teleported
4. **Multi-chain monitoring**: Nodes monitor various blockchains, including both EVM-compatible chains (like Ethereum, Binance Smart Chain, etc.) and non-EVM chains (like XRP Ledger)

The MPC nodes are containerized using Docker and can be deployed on Kubernetes clusters for production environments.

### Bridge UI

The bridge UI is a Next.js application that provides:

1. **Swap interface**: Allows users to initiate cross-chain transfers
2. **Network selection**: Support for multiple source and destination networks
3. **Token selection**: Support for various tokens on each network
4. **Wallet integration**: Connection to various wallets (EVM, Solana, etc.)
5. **Transaction history**: View and track past transactions

## Bridge Workflow

The bridge operates through the following workflow:

1. **User initiates a transfer**:
   - User connects their wallet to the bridge UI
   - Selects source network, token, amount, destination network, and address
   - Confirms the transaction

2. **Source chain operations**:
   - If using a wrapped token: Burns the token on the source chain
   - If using a native token: Locks the token in the vault

3. **MPC node validation**:
   - MPC nodes monitor the source chain for bridge events
   - For EVM chains, nodes look for BridgeBurned or VaultDeposit events
   - For XRPL, nodes look for Payment transactions to the teleporter address
   - Validate the transaction and collectively sign the approval
   - No single node has the complete private key

4. **Destination chain operations**:
   - If minting a wrapped token: Creates new tokens on the destination chain
   - If releasing a native token: Releases tokens from the vault
   - Transfers to the recipient address

5. **Transaction completion**:
   - User receives tokens on the destination chain
   - UI updates to show transaction status

## Development Environment

The project uses:

- **Node.js v20+**: JavaScript runtime
- **pnpm**: Package manager (v9.15.0+)
- **Next.js**: React framework for the UI
- **TypeScript**: For type-safe code
- **Hardhat**: Ethereum development environment for contracts
- **Docker/Kubernetes**: For containerization and deployment of MPC nodes

## Running Locally

To run the bridge locally:

1. Install `pnpm`: https://pnpm.io/installation
2. Install dependencies: `pnpm install`
3. Run the bridge UI: `pnpm dev`

## Supported Chains and Networks

The bridge currently supports the following blockchain networks:

### Mainnets
- **EVM-Compatible**:
  - Ethereum (Chain ID: 1)
  - Binance Smart Chain (Chain ID: 56)
  - Polygon (Chain ID: 137)
  - Optimism (Chain ID: 10)
  - Arbitrum One (Chain ID: 42161)
  - Celo (Chain ID: 42220)
  - Base (Chain ID: 8453)
  - Avalanche (Chain ID: 43114)
  - Zora (Chain ID: 7777777)
  - Blast (Chain ID: 81457)
  - Linea (Chain ID: 59144)
  - Fantom (Chain ID: 250)
  - Aurora (Chain ID: 1313161554)
  - Gnosis (Chain ID: 100)
  - Lux Network (Chain ID: 96369)
  - Zoo Network (Chain ID: 200200)

- **Non-EVM Chains**:
  - XRP Ledger (XRPL) Mainnet

### Testnets
- **EVM-Compatible**:
  - Ethereum Sepolia (Chain ID: 11155111)
  - Ethereum Holesky (Chain ID: 17000)
  - Base Sepolia (Chain ID: 84532)
  - BSC Testnet (Chain ID: 97)
  - Lux Testnet (Chain ID: 96368)
  - Zoo Testnet (Chain ID: 200201)

- **Non-EVM Chains**:
  - XRPL Testnet
  - XRPL Devnet

For the most up-to-date list and configuration, refer to the settings file at:
`/mpc-nodes/docker/common/node/src/config/settings.ts`

## Architecture Decisions

### MPC Over Traditional Multi-sig

The bridge uses MPC for enhanced security compared to traditional multi-signature approaches:
- No single entity can compromise the bridge
- Private keys never exist in complete form
- Decentralized validation of cross-chain transfers

### Vault System

The vault system allows for:
- Secure custody of assets during the bridge process
- Efficient asset management across chains
- Fee collection mechanism for bridge operations

### Modular Design

The project's modular architecture enables:
- Easy addition of new blockchain networks
- Support for different token types
- Scalable infrastructure to handle increasing loads

## Security Considerations

The bridge implements multiple security measures:

1. **Threshold Signatures**: Requires a minimum number of MPC nodes to sign transactions
2. **Transaction Replay Protection**: Prevents replay attacks
3. **Fee Mechanisms**: Discourages spam and funds system maintenance
4. **Validation Checks**: Ensures transactions meet all requirements before execution

## Adding New Chains

### Adding a New EVM Chain

To add a new EVM-compatible chain to the bridge, follow these steps:

1. **Update Configuration**:
   - Edit the configuration file at `/mpc-nodes/docker/common/node/src/config/settings.ts`
   - Add a new entry to the `MAIN_NETWORKS` or `TEST_NETWORKS` array with the following information:
     - `display_name`: User-friendly name of the network
     - `internal_name`: Unique identifier for the network
     - `is_testnet`: Boolean indicating if it's a testnet
     - `chain_id`: The numeric chain ID
     - `teleporter`: Address of the teleporter contract on this chain
     - `vault`: Address of the vault contract on this chain
     - `node`: RPC endpoint URL for this chain
     - `currencies`: Array of supported tokens on this chain

2. **Deploy Smart Contracts**:
   - Deploy the Bridge.sol contract on the new chain
   - Deploy the ERC20B.sol contract for bridgeable tokens
   - Deploy the LuxVault.sol or ETHVault.sol as needed
   - Update the configuration with the new contract addresses

3. **Update Swap Pairs**:
   - Add entries to the `SWAP_PAIRS` object to define which tokens on the new chain can be swapped with tokens on other chains

4. **Testing**:
   - Test transactions from the new chain to existing chains
   - Test transactions from existing chains to the new chain
   - Verify that tokens can be correctly bridged in both directions

### Adding a Non-EVM Blockchain (like XRPL)

Adding a non-EVM blockchain requires additional custom implementation:

1. **Update Configuration**:
   - Similar to EVM chains, add the configuration to the settings file
   - Specify blockchain-specific parameters (like node endpoints and teleporter addresses)

2. **Implement Blockchain Monitors**:
   - In the MPC node, add specialized monitoring for the blockchain events
   - For example, for XRPL, the implementation is in `node.ts` and looks for Payment transactions to the teleporter address

3. **Add Transaction Validation**:
   - Implement chain-specific validation of transactions
   - For XRPL, this includes validating that the transaction is of type "Payment" and is sent to the correct teleporter address

4. **Add Chain Libraries**:
   - Import and use chain-specific libraries for interacting with the blockchain
   - For XRPL, this includes the `xrpl` library

5. **Implement Signature Generation**:
   - Add support for generating signatures for minting tokens on destination chains
   - Ensure that the transaction data is correctly formatted for the chain's requirements

6. **Update UI**:
   - Add support in the UI for connecting to the new blockchain's wallets
   - Update network selection to include the new blockchain

7. **Testing**:
   - Test transactions from the new blockchain to existing chains
   - Test transactions from existing chains to the new blockchain
   - Verify that tokens can be correctly bridged in both directions
