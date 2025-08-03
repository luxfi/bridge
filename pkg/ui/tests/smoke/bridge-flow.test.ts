import { BridgeTestHelper } from '../../src/helpers/bridge-helper';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

describe('Bridge Flow - Smoke Tests', () => {
  let bridge: BridgeTestHelper;
  const TEST_RECIPIENT = process.env.TEST_WALLET_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA2e';

  beforeEach(async () => {
    bridge = new BridgeTestHelper(process.env.BRIDGE_UI_URL);
    await bridge.initialize();
  });

  afterEach(async () => {
    await bridge.cleanup();
  });

  describe('Basic Bridge Transfer', () => {
    it('should display bridge interface', async () => {
      // Check main elements are present
      await bridge.waitForElement('[data-testid="connect-wallet"]');
      await bridge.waitForElement('[data-testid="source-network-dropdown"]');
      await bridge.waitForElement('[data-testid="destination-network-dropdown"]');
    });

    it('should connect wallet successfully', async () => {
      await bridge.connectWallet('metamask');
      
      // Verify wallet connected
      const connectedAddress = await bridge.waitForElement('[data-testid="connected-address"]');
      expect(await connectedAddress.isDisplayed()).toBe(true);
    });

    it('should allow network selection', async () => {
      await bridge.connectWallet('metamask');
      
      // Select networks
      await bridge.selectSourceNetwork('ethereum');
      await bridge.selectDestinationNetwork('bsc');
      
      // Verify selections
      const sourceNetwork = await bridge.waitForElement('[data-testid="selected-source-network"]');
      const destNetwork = await bridge.waitForElement('[data-testid="selected-dest-network"]');
      
      expect(await sourceNetwork.getText()).toContain('Ethereum');
      expect(await destNetwork.getText()).toContain('BSC');
    });
  });

  describe('MPC Integration', () => {
    it('should show MPC node status', async () => {
      const status = await bridge.getMPCStatus();
      
      expect(status.activeNodes).toBeGreaterThanOrEqual(2);
      expect(status.threshold).toBe(2);
      expect(status.ready).toBe(true);
    });
  });

  describe('Full Transfer Flow', () => {
    it('should complete USDC transfer from Ethereum to BSC', async () => {
      // Skip in CI if no test wallet configured
      if (!process.env.TEST_WALLET_PRIVATE_KEY) {
        console.log('Skipping: No test wallet configured');
        return;
      }

      // Connect wallet
      await bridge.connectWallet('metamask');
      
      // Configure transfer
      await bridge.selectSourceNetwork('ethereum');
      await bridge.selectDestinationNetwork('bsc');
      await bridge.selectToken('USDC');
      await bridge.enterAmount('10');
      await bridge.enterRecipient(TEST_RECIPIENT);
      
      // Get initial balance
      const initialBalance = await bridge.getDestinationBalance('USDC');
      
      // Execute transfer
      await bridge.approveToken();
      const txId = await bridge.initiateBridge();
      
      console.log(`Bridge transaction initiated: ${txId}`);
      
      // Wait for completion
      await bridge.waitForCompletion(txId);
      
      // Verify balance increased
      const finalBalance = await bridge.getDestinationBalance('USDC');
      expect(finalBalance).toBeGreaterThan(initialBalance);
    }, 600000); // 10 minute timeout for full flow
  });
});