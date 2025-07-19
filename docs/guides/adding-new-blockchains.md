# TODO

We would like to support all major blockchains, here are some notes on how to
proceed with various chain architectures.

## General Implementation Pattern

For each blockchain, you'll need to implement:

1. **Configuration**: Add network settings
2. **Transaction Verification**: Validate source chain transactions
3. **Data Extraction**: Extract transaction data (amount, sender, etc.)
4. **MPC Signature Generation**: Feed data to existing MPC system
5. **UI Integration**: Update UI to support the new blockchain

## Bitcoin-style Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Bitcoin",
  internal_name: "BTC_MAINNET",
  is_testnet: false,
  chain_id: "BTC-MAINNET",
  teleporter: "<BTC_TELEPORTER_ADDRESS>",
  vault: "<BTC_VAULT_ADDRESS>",
  node: "https://bitcoin-rpc-endpoint.com",
  currencies: [
    {
      name: "BTC",
      asset: "BTC",
      contract_address: null,
      decimals: 8,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "BTC_MAINNET" ||
  fromNetwork.internal_name === "BTC_TESTNET"
) {
  // Import BitcoinJS
  const bitcoin = require('bitcoinjs-lib');
  const axios = require('axios');

  try {
    // Create RPC client
    const rpcClient = new BitcoinRpcClient(fromNetwork.node);

    // Fetch transaction
    const txData = await rpcClient.getRawTransaction(txId, true);

    // Validate it's to our teleporter address
    let isValidTx = false;
    let amount = 0;
    let sender = '';

    for (const output of txData.vout) {
      if (output.scriptPubKey.addresses &&
          output.scriptPubKey.addresses.includes(fromNetwork.teleporter)) {
        isValidTx = true;
        amount = Math.floor(output.value * 100000000); // Convert to satoshis
      }
    }

    if (!isValidTx) {
      throw new Error("Invalid Bitcoin transaction");
    }

    // Similar to XRPL implementation, generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 8,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "btc",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "BTC",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## Solana Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Solana",
  internal_name: "SOLANA_MAINNET",
  is_testnet: false,
  chain_id: "SOL-MAINNET",
  teleporter: "<SOLANA_PROGRAM_ADDRESS>",
  vault: "<SOLANA_VAULT_ADDRESS>",
  node: "https://api.mainnet-beta.solana.com",
  currencies: [
    {
      name: "SOL",
      asset: "SOL",
      contract_address: null,
      decimals: 9,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "SOLANA_MAINNET" ||
  fromNetwork.internal_name === "SOLANA_DEVNET"
) {
  const solanaWeb3 = require('@solana/web3.js');
  const connection = new solanaWeb3.Connection(fromNetwork.node);

  try {
    // Fetch and parse transaction
    const tx = await connection.getParsedTransaction(txId, {commitment: 'confirmed'});

    // Verify transaction type and recipient
    if (!tx || !tx.meta || tx.meta.err) {
      throw new Error("Invalid Solana transaction");
    }

    // Check if it's a transfer to our teleporter address
    let isToTeleporter = false;
    let amount = 0;
    let sender = '';

    for (const instruction of tx.transaction.message.instructions) {
      if (instruction.program === 'system' &&
          instruction.parsed.type === 'transfer' &&
          instruction.parsed.info.destination === fromNetwork.teleporter) {
        isToTeleporter = true;
        amount = instruction.parsed.info.lamports;
        sender = instruction.parsed.info.source;
        break;
      }
    }

    if (!isToTeleporter) {
      throw new Error("Not a transfer to teleporter address");
    }

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 9,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "sol",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "SOL",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## Cardano Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Cardano",
  internal_name: "CARDANO_MAINNET",
  is_testnet: false,
  chain_id: "ADA-MAINNET",
  teleporter: "<CARDANO_TELEPORTER_ADDRESS>",
  vault: "<CARDANO_VAULT_ADDRESS>",
  node: "https://cardano-node-url.com",
  currencies: [
    {
      name: "ADA",
      asset: "ADA",
      contract_address: null,
      decimals: 6,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "CARDANO_MAINNET" ||
  fromNetwork.internal_name === "CARDANO_TESTNET"
) {
  // Use Cardano serialization lib
  const CardanoWasm = require('@emurgo/cardano-serialization-lib-nodejs');
  const BlockfrostAPI = require('@blockfrost/blockfrost-js');

  try {
    // Create API client
    const api = new BlockfrostAPI({
      projectId: process.env.BLOCKFROST_PROJECT_ID,
      network: fromNetwork.internal_name === "CARDANO_MAINNET" ? 'mainnet' : 'testnet',
    });

    // Get transaction
    const tx = await api.txs(txId);
    const txUtxos = await api.txsUtxos(txId);

    // Verify it's a payment to teleporter
    let isValidTx = false;
    let amount = 0;
    let sender = '';

    // Check outputs for teleporter address
    for (const output of txUtxos.outputs) {
      if (output.address === fromNetwork.teleporter) {
        // For ADA, we need to filter the lovelace (native token)
        for (const amount_item of output.amount) {
          if (amount_item.unit === 'lovelace') {
            isValidTx = true;
            amount = parseInt(amount_item.quantity);
            break;
          }
        }
      }
    }

    if (!isValidTx) {
      throw new Error("Invalid Cardano transaction");
    }

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 6,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "ada",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "ADA",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## TRON Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "TRON",
  internal_name: "TRON_MAINNET",
  is_testnet: false,
  chain_id: "TRX-MAINNET",
  teleporter: "<TRON_TELEPORTER_ADDRESS>",
  vault: "<TRON_VAULT_ADDRESS>",
  node: "https://api.trongrid.io",
  currencies: [
    {
      name: "TRX",
      asset: "TRX",
      contract_address: null,
      decimals: 6,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "TRON_MAINNET" ||
  fromNetwork.internal_name === "TRON_SHASTA"
) {
  const TronWeb = require('tronweb');
  const tronWeb = new TronWeb({
    fullHost: fromNetwork.node,
    headers: { "TRON-PRO-API-KEY": process.env.TRON_API_KEY }
  });

  try {
    // Fetch transaction info
    const txInfo = await tronWeb.trx.getTransaction(txId);
    const txInfo2 = await tronWeb.trx.getTransactionInfo(txId);

    // Verify transaction type and to address
    if (!txInfo || !txInfo.raw_data || !txInfo.raw_data.contract || txInfo.raw_data.contract.length === 0) {
      throw new Error("Invalid TRON transaction");
    }

    const contract = txInfo.raw_data.contract[0];
    if (contract.type !== 'TransferContract') {
      throw new Error("Not a transfer transaction");
    }

    const transferParams = contract.parameter.value;
    if (tronWeb.address.fromHex(transferParams.to_address) !== fromNetwork.teleporter) {
      throw new Error("Transfer not to teleporter address");
    }

    const amount = transferParams.amount;
    const sender = tronWeb.address.fromHex(transferParams.owner_address);

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 6,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "trx",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "TRX",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## Tezos Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Tezos",
  internal_name: "TEZOS_MAINNET",
  is_testnet: false,
  chain_id: "XTZ-MAINNET",
  teleporter: "<TEZOS_TELEPORTER_ADDRESS>",
  vault: "<TEZOS_VAULT_ADDRESS>",
  node: "https://mainnet.api.tez.ie",
  currencies: [
    {
      name: "XTZ",
      asset: "XTZ",
      contract_address: null,
      decimals: 6,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "TEZOS_MAINNET" ||
  fromNetwork.internal_name === "TEZOS_GHOSTNET"
) {
  const { TezosToolkit } = require('@taquito/taquito');
  const tezos = new TezosToolkit(fromNetwork.node);

  try {
    // Fetch operation
    const operation = await tezos.rpc.getOperationHash(txId);
    const opDetails = await tezos.rpc.getOperation(txId);

    // Find the transaction in the operation
    let validTx = false;
    let amount = 0;
    let sender = '';

    for (const content of opDetails.contents) {
      if (content.kind === 'transaction' && content.destination === fromNetwork.teleporter) {
        validTx = true;
        amount = parseInt(content.amount);
        sender = content.source;
        break;
      }
    }

    if (!validTx) {
      throw new Error("Invalid Tezos transaction or not to teleporter");
    }

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 6,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "xtz",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "XTZ",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## Cosmos Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Cosmos Hub",
  internal_name: "COSMOS_MAINNET",
  is_testnet: false,
  chain_id: "ATOM-MAINNET",
  teleporter: "<COSMOS_TELEPORTER_ADDRESS>",
  vault: "<COSMOS_VAULT_ADDRESS>",
  node: "https://lcd-cosmoshub.keplr.app",
  currencies: [
    {
      name: "ATOM",
      asset: "ATOM",
      contract_address: null,
      decimals: 6,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "COSMOS_MAINNET" ||
  fromNetwork.internal_name === "COSMOS_TESTNET"
) {
  const { LcdClient } = require('@cosmjs/launchpad');
  const axios = require('axios');

  try {
    // Create client
    const client = new LcdClient(fromNetwork.node);

    // Fetch transaction
    const txResponse = await axios.get(`${fromNetwork.node}/cosmos/tx/v1beta1/txs/${txId}`);
    const tx = txResponse.data.tx_response;

    if (!tx || tx.code !== 0) {
      throw new Error("Invalid Cosmos transaction");
    }

    // Parse messages to find Send
    let validTx = false;
    let amount = 0;
    let sender = '';

    for (const msg of tx.tx.body.messages) {
      if (msg['@type'] === '/cosmos.bank.v1beta1.MsgSend' &&
          msg.to_address === fromNetwork.teleporter) {
        validTx = true;

        // Find ATOM amount
        for (const coin of msg.amount) {
          if (coin.denom === 'uatom') { // micro ATOM
            amount = parseInt(coin.amount);
            sender = msg.from_address;
            break;
          }
        }

        break;
      }
    }

    if (!validTx) {
      throw new Error("No valid payment to teleporter found");
    }

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 6,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "atom",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "ATOM",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## Algorand Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Algorand",
  internal_name: "ALGORAND_MAINNET",
  is_testnet: false,
  chain_id: "ALGO-MAINNET",
  teleporter: "<ALGORAND_TELEPORTER_ADDRESS>",
  vault: "<ALGORAND_VAULT_ADDRESS>",
  node: "https://mainnet-api.algonode.cloud",
  currencies: [
    {
      name: "ALGO",
      asset: "ALGO",
      contract_address: null,
      decimals: 6,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "ALGORAND_MAINNET" ||
  fromNetwork.internal_name === "ALGORAND_TESTNET"
) {
  const algosdk = require('algosdk');

  try {
    // Create client
    const algodClient = new algosdk.Algodv2(
      process.env.ALGO_API_TOKEN,
      fromNetwork.node,
      process.env.ALGO_PORT
    );

    // Fetch transaction
    const txInfo = await algodClient.pendingTransactionInformation(txId).do();

    // Verify it's a payment to teleporter
    if (txInfo['tx-type'] !== 'pay' ||
        txInfo['payment-transaction'].receiver !== fromNetwork.teleporter) {
      throw new Error("Not a payment to teleporter address");
    }

    const amount = txInfo['payment-transaction'].amount;
    const sender = txInfo.sender;

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 6,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "algo",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "ALGO",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## Aptos Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Aptos",
  internal_name: "APTOS_MAINNET",
  is_testnet: false,
  chain_id: "APT-MAINNET",
  teleporter: "<APTOS_TELEPORTER_ADDRESS>",
  vault: "<APTOS_VAULT_ADDRESS>",
  node: "https://fullnode.mainnet.aptoslabs.com/v1",
  currencies: [
    {
      name: "APT",
      asset: "APT",
      contract_address: null,
      decimals: 8,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "APTOS_MAINNET" ||
  fromNetwork.internal_name === "APTOS_TESTNET"
) {
  const { AptosClient } = require('aptos');
  const client = new AptosClient(fromNetwork.node);

  try {
    // Fetch transaction
    const tx = await client.getTransactionByHash(txId);

    // Verify it's a coin transfer to teleporter
    let validTx = false;
    let amount = 0;
    let sender = '';

    if (tx.type === 'user_transaction' &&
        tx.payload.function === '0x1::coin::transfer' &&
        tx.payload.arguments[0] === fromNetwork.teleporter) {
      validTx = true;
      amount = tx.payload.arguments[1];
      sender = tx.sender;
    }

    if (!validTx) {
      throw new Error("Invalid Aptos transaction");
    }

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 8,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "apt",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "APT",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## Sui Network Implementation

```typescript
// 1. Add to settings.ts
{
  display_name: "Sui",
  internal_name: "SUI_MAINNET",
  is_testnet: false,
  chain_id: "SUI-MAINNET",
  teleporter: "<SUI_TELEPORTER_ADDRESS>",
  vault: "<SUI_VAULT_ADDRESS>",
  node: "https://fullnode.mainnet.sui.io:443",
  currencies: [
    {
      name: "SUI",
      asset: "SUI",
      contract_address: null,
      decimals: 9,
      is_native: true
    }
  ]
}

// 2. Add to node.ts
if (
  fromNetwork.internal_name === "SUI_MAINNET" ||
  fromNetwork.internal_name === "SUI_TESTNET"
) {
  const { JsonRpcProvider, Connection } = require('@mysten/sui.js');

  try {
    // Create connection to Sui
    const connection = new Connection({ fullnode: fromNetwork.node });
    const provider = new JsonRpcProvider(connection);

    // Fetch transaction
    const txInfo = await provider.getTransactionBlock({
      digest: txId,
      options: { showEffects: true, showInput: true }
    });

    // Verify it's a transfer to teleporter
    let validTx = false;
    let amount = 0;
    let sender = '';

    // Parse transaction effects to find transfer to teleporter
    for (const effect of txInfo.effects.events) {
      if (effect.type === 'coinBalanceChange' &&
          effect.owner?.AddressOwner === fromNetwork.teleporter &&
          effect.coinType === '0x2::sui::SUI' &&
          effect.amount > 0) {
        validTx = true;
        amount = effect.amount;
        sender = txInfo.transaction.data.sender;
        break;
      }
    }

    if (!validTx) {
      throw new Error("Not a valid transfer to teleporter");
    }

    // Generate MPC signature
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form: null,
      toNetworkId,
      hashedTxId: txId,
      toTokenAddress,
      tokenAmount: amount.toString(),
      decimals: 9,
      receiverAddressHash,
      nonce,
      vault: false
    });

    // Save transaction info
    await savehashedTxId({
      chainType: "sui",
      txId,
      amount: amount.toString(),
      signature: signature + "###" + mpcSigner,
      hashedTxId: txId
    });

    res.json({ status: true, data: {
      teleporter: fromNetwork.teleporter,
      token: "SUI",
      from: sender,
      eventName: "Payment",
      value: amount.toString(),
      signature,
      mpcSigner,
      hashedTxId: txId
    }});
    return;
  } catch (err) {
    res.json({ status: false, msg: err.message });
    return;
  }
}
```

## General Implementation Notes

For all blockchains, remember to:

1. **Update SWAP_PAIRS in settings.ts**:
   ```typescript
   // Add to SWAP_PAIRS
   BTC: ["LBTC", "ZBTC"],
   SOL: ["LSOL", "ZSOL"],
   ADA: ["LADA", "ZADA"],
   // ... and so on for each blockchain's native token
   ```

2. **Install Required Dependencies**:
   ```bash
   pnpm add bitcoinjs-lib axios @solana/web3.js @emurgo/cardano-serialization-lib-nodejs @blockfrost/blockfrost-js tronweb @taquito/taquito @cosmjs/launchpad algosdk aptos @mysten/sui.js
   ```

3. **Update UI Components**:
   - Add wallet connectors for each blockchain
   - Update network selection UI
   - Add blockchain-specific icons and branding

4. **Create Teleporter and Vault Addresses**:
   - For each blockchain, you'll need to generate addresses or deploy contracts to serve as teleporters and vaults

5. **Testing Steps**:
   1. Test transactions from new chain to existing chains
   2. Test transactions from existing chains to new chain
   3. Verify token balances and transaction statuses
   4. Test edge cases (failed transactions, network issues)

Each blockchain implementation follows the same pattern demonstrated in the XRPL implementation: verify transaction on source chain, then use the MPC system to generate signatures for the destination chain. The main differences are in the transaction verification process and blockchain-specific client libraries.
