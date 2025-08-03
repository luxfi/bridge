# Bridge UI Automation

Automated UI testing for the Lux Bridge using Selenium WebDriver and TypeScript.

## Overview

This test suite validates the complete bridge flow including:
- Wallet connection (MetaMask, WalletConnect, etc.)
- Network selection and switching
- Token selection and amount input
- Cross-chain transfers with MPC signatures
- Transaction status tracking
- Error handling

## Quick Start

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Set up test wallets:**
   ```sh
   npm run setup:wallets
   ```

3. **Run all tests:**
   ```sh
   npm test
   ```

## Test Scenarios

### Core Bridge Flow
- Connect wallet
- Select source network and token
- Select destination network
- Enter amount and recipient
- Approve token (if needed)
- Initiate bridge transfer
- Monitor transaction status
- Verify completion on destination

### MPC Integration Tests
- Key generation coordination
- Signature generation for transfers
- Threshold signature validation
- Node failure recovery

### Error Scenarios
- Insufficient balance
- Network errors
- MPC node failures
- Invalid addresses
- Gas estimation failures

## Running Tests

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:smoke` | Quick smoke tests |
| `npm run test:mpc` | MPC-specific tests |
| `npm run test:networks` | Network switching tests |
| `npm run test:tokens` | Token transfer tests |

## Configuration

Create a `.env.test` file:

```env
# Test wallet credentials
TEST_WALLET_PRIVATE_KEY=your_test_wallet_key
TEST_WALLET_ADDRESS=your_test_wallet_address

# Bridge endpoints
BRIDGE_UI_URL=http://localhost:3000
BRIDGE_API_URL=http://localhost:5000

# MPC nodes
MPC_NODE_URLS=http://localhost:6000,http://localhost:6001,http://localhost:6002

# Test networks
TEST_NETWORKS=ethereum,bsc,polygon,lux
```

## MPC Testing

The MPC integration tests validate:
1. **Key Generation**: Distributed key generation across nodes
2. **Signing**: Threshold signature generation
3. **Recovery**: Node failure and recovery scenarios
4. **Performance**: Signature generation time

## Writing Tests

Example test structure:

```typescript
import { BridgeTestHelper } from './helpers/bridge-helper';

describe('Bridge Transfer Flow', () => {
  let bridge: BridgeTestHelper;

  beforeEach(async () => {
    bridge = new BridgeTestHelper();
    await bridge.initialize();
  });

  it('should complete cross-chain transfer', async () => {
    // Connect wallet
    await bridge.connectWallet('metamask');
    
    // Select networks
    await bridge.selectSourceNetwork('ethereum');
    await bridge.selectDestinationNetwork('bsc');
    
    // Configure transfer
    await bridge.selectToken('USDC');
    await bridge.enterAmount('100');
    await bridge.enterRecipient(TEST_RECIPIENT);
    
    // Execute transfer
    await bridge.approveToken();
    const txId = await bridge.initiateBridge();
    
    // Monitor completion
    await bridge.waitForCompletion(txId);
    
    // Verify on destination
    const balance = await bridge.getDestinationBalance('USDC');
    expect(balance).toBeGreaterThan(99); // Account for fees
  });
});
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Before deployment

GitHub Actions workflow included in `.github/workflows/bridge-tests.yml`