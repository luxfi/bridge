import { createGrpcClient, serviceAccountAuthStrategy } from "@/index";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";

const filePath = path.join(
  os.homedir(),
  ".config",
  "utila",
  "credentials",
  "lux-bridge@vault-11b8bd854f3e.utilaserviceaccount.io",
  "private_key.pem"
);

// Create gRPC client
export const client = createGrpcClient({
  authStrategy: serviceAccountAuthStrategy({
    email: "lux-bridge@vault-11b8bd854f3e.utilaserviceaccount.io",
    privateKey: () =>
      readFile(filePath, {
        encoding: "utf-8",
      }),
  }),
}).version("v1alpha2");

(async () => {
  try {
    console.log("Starting...");

    // Step 1: Fetch vaults
    console.log("Fetching vaults...");
    const vaultsResponse = await client.listVaults({});
    const vaults = vaultsResponse.vaults || [];
    if (vaults.length === 0) throw new Error("No vaults found.");
    const targetVault = vaults[0];
    console.log(`Using Vault: ${targetVault.displayName} (${targetVault.name})`);

    // Step 2: Function to create a new wallet
    const createNewWallet = async (vaultName: string, network: string, depositName: string) => {
      console.log(`Creating new wallet for ${depositName} on ${network}...`);
      const payload = {
        parent: vaultName,
        wallet: {
          displayName: depositName,
          networks: [network],
        },
      };
      console.log("CreateWallet Payload:", payload);

      const walletResponse = await client.createWallet(payload);
      console.log(`${depositName} Wallet Created:`, walletResponse.wallet.name);
      return walletResponse.wallet;
    };

    // Step 3: Create wallets for BTC, TON, and SOL deposits
    const walletsToArchive = [];
    const btcWallet = await createNewWallet(
      targetVault.name,
      "networks/bitcoin-mainnet",
      `btc-deposit-${Date.now()}`
    );
    walletsToArchive.push(btcWallet);

    const tonWallet = await createNewWallet(
      targetVault.name,
      "networks/ton-mainnet",
      `ton-deposit-${Date.now()}`
    );
    walletsToArchive.push(tonWallet);

    const solWallet = await createNewWallet(
      targetVault.name,
      "networks/solana-mainnet",
      `sol-deposit-${Date.now()}`
    );
    walletsToArchive.push(solWallet);

    // Step 4: Log details for each created wallet
    console.log("BTC Wallet Details:", btcWallet);
    console.log("TON Wallet Details:", tonWallet);
    console.log("SOL Wallet Details:", solWallet);

    // Step 5: Archive all created wallets
    console.log("Archiving all created wallets...");
    for (const wallet of walletsToArchive) {
      try {
        console.log(`Archiving Wallet: ${wallet.displayName} (${wallet.name})`);
        await client.archiveWallet({
          name: wallet.name,
          allowMissing: true,
        });
        console.log(`Wallet archived: ${wallet.displayName}`);
      } catch (archiveError) {
        console.error(`Failed to archive wallet: ${wallet.displayName}`, archiveError);
      }
    }

    console.log("All wallets created and archived successfully!");
  } catch (error) {
    console.error("Error encountered:");
    console.error("Message:", error.message);
    console.error("Full Error Details:", JSON.stringify(error, null, 2));
  }
})();
