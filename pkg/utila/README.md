# Utila API SDK

This SDK provides developers with tools to easily integrate Utila's API services into JavaScript applications. It simplifies authentication and interaction with Utila's APIs.

## Features

- Easy authentication with service accounts
- Promise-based API methods for asynchronous operations
- Supports both JavaScript and TypeScript

## Installation

Ensure Node.js (v18.x or later) is installed on your machine.

1. **Create a Service Account:**

   - Visit the [Utila Console](https://console.utila.io/settings/service-accounts)
   - Ensure you are logged in as an administrator
   - Create a new service account

2. **Install the SDK:**
   - Open your terminal
   - Execute the following command within your project directory:

```bash
npm install @utila/api
```

## Configuration

Set up the SDK using the credentials from your service account:

1. Store your service account's private key file securely within your project
2. Reference the key file correctly in your environment settings or directly in the application code

### Usage Example

```ts
import { createApiClient, serviceAccountAuthStrategy } from '@utila/api';
import { readFile } from 'fs/promises';

// Configure the API client
// This function initializes the client with a strategy to authenticate using a service account
const client = createApiClient({
  authStrategy: serviceAccountAuthStrategy({
    email: 'your-service-account-email@utila.io',
    privateKey: () =>
      readFile('path/to/your/private-key.pem', { encoding: 'utf-8' }),
  }),
});

// Define an asynchronous function to fetch balances
async function getBalances() {
  try {
    // Query balance information
    // This method fetches balance details from a specified 'parent' vault
    const { balances } = await client.balances.queryBalances({
      parent: 'vaults/vault_id',
    });
    // Output the fetched balances to the console
    console.log(balances);
  } catch (error) {
    // Handle errors gracefully
    console.error('Failed to fetch balances:', error);
  }
}

// Invoke the function to get balances
getBalances();
```

The SDK uses the credentials of a service account to authenticate API requests. This involves specifying the email associated with the service account and a function to read the private key file asynchronously.

For more detailed documentation on other capabilities such as managing transactions, wallets, etc., refer to the API [documentation](https://api-preview.docs.utila.io/v1alpha1/index.html).

## Available Methods

<!-- placeholder -->
### Transactions
- listTransactions
- getTransaction
- batchGetTransactions
- initiateTransaction
- estimateTransactionFee

### Assets
- getAsset
- batchGetAssets

### Balances
- queryBalances

### Blockchains
- getNetwork
- listNetworks
- getLatestBatchContract

### Vaults
- getVault
- listVaults

### Wallets
- generateWallet
- listWallets
- createWalletAddress
<!-- end placeholder -->

## Support

If you encounter any issues or have questions, please visit our support page or raise an issue on the GitHub repository.
