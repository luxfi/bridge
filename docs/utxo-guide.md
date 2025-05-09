# UTXO Withdrawal System: Implementation Guide

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Bitcoin Implementation](#bitcoin-implementation)
3. [Avalanche X-Chain Implementation](#avalanche-x-chain-implementation)
4. [MPC Signing System](#mpc-signing-system)
5. [Common Utilities](#common-utilities)
6. [Configuration Examples](#configuration-examples)

## System Architecture

```typescript
interface UTXOWithdrawalSystem {
  // Chain-specific components
  chainHandlers: Map<string, ChainHandler>;

  // Core services
  mpcService: MultiChainMPCSigner;
  database: UTXODatabase;

  // API endpoints
  initializeWithdrawal(request: WithdrawalRequest): Promise<string>; // Returns requestId
  getWithdrawalStatus(requestId: string): Promise<WithdrawalStatus>;
  triggerSweep(chainType: string): Promise<SweepResult>;
}

// Chain handler interface
interface ChainHandler {
  chainType: string;

  // UTXO management
  refreshUTXOs(): Promise<void>;
  selectUTXOs(amount: string, assetID: string): Promise<UTXO[]>;

  // Transaction building
  buildWithdrawalTransaction(
    utxos: UTXO[],
    destinationAddress: string,
    amount: string,
    changeAddress: string
  ): Promise<UnsignedTransaction>;

  buildSweepTransaction(
    utxos: UTXO[],
    destinationAddress: string
  ): Promise<UnsignedTransaction>;

  // Transaction signing and broadcasting
  signTransaction(unsignedTx: UnsignedTransaction): Promise<SignedTransaction>;
  broadcastTransaction(signedTx: SignedTransaction): Promise<string>; // Returns txId

  // Sweep functionality
  shouldSweep(): Promise<boolean>;
  getSweepableUTXOs(): Promise<UTXO[]>;
}

// Processing workflow
class WithdrawalProcessor {
  // Process withdrawals in parallel batches
  async processQueue(): Promise<void> {
    const pendingWithdrawals = await this.database.getPendingWithdrawals();
    const batchedWithdrawals = this.batchWithdrawals(pendingWithdrawals);

    for (const batch of batchedWithdrawals) {
      await Promise.all(batch.map(withdrawal => this.processWithdrawal(withdrawal)));
    }

    // Trigger sweep after processing withdrawals
    await this.triggerSweepsIfNeeded();
  }
}

// Base UTXO structure
interface UTXO {
  txId: string;
  outputIndex: number;
  amount: string;
  address: string;
  chainType: string;
  assetID: string;
  confirmations: number;
  status: 'available' | 'reserved' | 'spent';
  reservedAt?: number;
  spentAt?: number;
  spentInTxId?: string;
}
```

## Bitcoin Implementation

### UTXO Manager

```typescript
class BitcoinUTXOManager {
  constructor(
    private bitcoinClient: BitcoinClient,
    private database: UTXODatabase,
    private config: BitcoinConfig
  ) {}

  // Refresh UTXOs from the network
  async refreshUTXOs(): Promise<void> {
    const addresses = this.config.teleporterAddresses;

    for (const address of addresses) {
      const utxos = await this.bitcoinClient.getUTXOs(address);

      for (const utxo of utxos) {
        const existingUTXO = await this.database.getUTXO('bitcoin', utxo.txid, utxo.vout);

        if (!existingUTXO) {
          await this.database.addUTXO({
            txId: utxo.txid,
            outputIndex: utxo.vout,
            amount: utxo.value.toString(),
            address: utxo.address,
            chainType: 'bitcoin',
            assetID: 'BTC', // Only BTC for Bitcoin
            confirmations: utxo.confirmations,
            status: 'available'
          });
        } else {
          // Update confirmations for existing UTXO
          await this.database.updateUTXO(
            'bitcoin',
            utxo.txid,
            utxo.vout,
            { confirmations: utxo.confirmations }
          );
        }
      }
    }
  }

  // Select UTXOs for withdrawal
  async selectUTXOs(amount: string, _assetID: string): Promise<UTXO[]> {
    const amountSatoshis = BigInt(amount);
    const feeRate = this.config.feeRate;

    // Get available UTXOs
    const availableUTXOs = await this.database.getAvailableUTXOs('bitcoin');

    // Ensure UTXOs have enough confirmations
    const confirmedUTXOs = availableUTXOs.filter(
      utxo => utxo.confirmations >= this.config.minConfirmations
    );

    // Branch and bound algorithm for coin selection
    return this.coinSelection(confirmedUTXOs, amountSatoshis, feeRate);
  }

  // Branch and bound algorithm for coin selection
  private coinSelection(utxos: UTXO[], targetAmount: bigint, feeRate: number): UTXO[] {
    // Implementation of BnB algorithm
    // This is more efficient than a simple greedy algorithm

    // Sort UTXOs by value (descending)
    utxos.sort((a, b) => (BigInt(b.amount) - BigInt(a.amount)));

    // Try to find exact match
    const exactMatch = this.findExactMatch(utxos, targetAmount);
    if (exactMatch) return exactMatch;

    // Try branch and bound
    const bnbResult = this.branchAndBound(utxos, targetAmount, feeRate);
    if (bnbResult) return bnbResult;

    // Fallback to greedy algorithm
    return this.greedySelection(utxos, targetAmount, feeRate);
  }
}
```

### Transaction Building

```typescript
class BitcoinTransactionBuilder {
  constructor(
    private bitcoinClient: BitcoinClient,
    private config: BitcoinConfig
  ) {}

  // Build transaction for withdrawal
  async buildWithdrawalTransaction(
    utxos: UTXO[],
    destinationAddress: string,
    amount: string,
    changeAddress: string
  ): Promise<UnsignedTransaction> {
    const bitcoinjs = require('bitcoinjs-lib');
    const network = this.config.network === 'mainnet'
      ? bitcoinjs.networks.bitcoin
      : bitcoinjs.networks.testnet;

    // Create PSBT
    const psbt = new bitcoinjs.Psbt({ network });

    // Add inputs
    for (const utxo of utxos) {
      const utxoDetails = await this.bitcoinClient.getTransactionOutput(
        utxo.txId,
        utxo.outputIndex
      );

      psbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          script: Buffer.from(utxoDetails.scriptPubKey.hex, 'hex'),
          value: Number(utxo.amount)
        }
      });
    }

    // Add outputs
    const amountSatoshis = BigInt(amount);

    // Add the destination output
    psbt.addOutput({
      address: destinationAddress,
      value: Number(amountSatoshis)
    });

    // Calculate total input amount
    const totalInput = utxos.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount),
      BigInt(0)
    );

    // Calculate fee
    const fee = this.calculateFee(utxos.length, 2, this.config.feeRate); // 2 outputs (destination + change)

    // Calculate change
    const changeAmount = totalInput - amountSatoshis - BigInt(fee);

    // Add change output if needed
    if (changeAmount > BigInt(this.config.dustThreshold)) {
      psbt.addOutput({
        address: changeAddress,
        value: Number(changeAmount)
      });
    }

    return {
      chainType: 'bitcoin',
      psbt,
      inputs: utxos,
      fee: fee.toString(),
      changeAddress,
      changeAmount: changeAmount.toString()
    };
  }

  // Build transaction for sweeping
  async buildSweepTransaction(
    utxos: UTXO[],
    destinationAddress: string
  ): Promise<UnsignedTransaction> {
    const bitcoinjs = require('bitcoinjs-lib');
    const network = this.config.network === 'mainnet'
      ? bitcoinjs.networks.bitcoin
      : bitcoinjs.networks.testnet;

    // Create PSBT
    const psbt = new bitcoinjs.Psbt({ network });

    // Add inputs
    for (const utxo of utxos) {
      const utxoDetails = await this.bitcoinClient.getTransactionOutput(
        utxo.txId,
        utxo.outputIndex
      );

      psbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          script: Buffer.from(utxoDetails.scriptPubKey.hex, 'hex'),
          value: Number(utxo.amount)
        }
      });
    }

    // Calculate total input amount
    const totalInput = utxos.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount),
      BigInt(0)
    );

    // Calculate fee (only 1 output for sweep)
    const fee = this.calculateFee(utxos.length, 1, this.config.feeRate);

    // Calculate output amount
    const outputAmount = totalInput - BigInt(fee);

    // Add output to destination address
    psbt.addOutput({
      address: destinationAddress,
      value: Number(outputAmount)
    });

    return {
      chainType: 'bitcoin',
      psbt,
      inputs: utxos,
      fee: fee.toString(),
      changeAddress: null,
      changeAmount: '0'
    };
  }

  // Calculate fee based on vBytes
  private calculateFee(inputCount: number, outputCount: number, feeRate: number): number {
    // For Segwit transactions:
    // Each input: ~68-70 vBytes
    // Each output: ~31-33 vBytes
    // Transaction overhead: ~10-12 vBytes
    const vBytesPerInput = 70;
    const vBytesPerOutput = 33;
    const transactionOverhead = 12;

    const estimatedVSize =
      transactionOverhead +
      (inputCount * vBytesPerInput) +
      (outputCount * vBytesPerOutput);

    return estimatedVSize * feeRate;
  }
}
```

### Bitcoin Signing and Broadcasting

```typescript
class BitcoinTransactionSigner {
  constructor(
    private mpcService: MultiChainMPCSigner,
    private config: BitcoinConfig
  ) {}

  // Sign transaction
  async signTransaction(unsignedTx: UnsignedTransaction): Promise<SignedTransaction> {
    const bitcoinjs = require('bitcoinjs-lib');
    const psbt = unsignedTx.psbt;

    // For each input
    for (let i = 0; i < psbt.inputCount; i++) {
      // Get the hash to sign
      const hashToSign = psbt.getHashToSign(i);

      // Sign the hash with MPC
      const signature = await this.mpcService.signDigest(
        Buffer.from(hashToSign),
        'bitcoin'
      );

      // Add sighash flag
      const signatureWithHashType = Buffer.concat([
        signature,
        Buffer.from([bitcoinjs.Transaction.SIGHASH_ALL])
      ]);

      // Apply the signature
      psbt.updateInput(i, {
        partialSig: [{
          pubkey: Buffer.from(this.config.publicKey, 'hex'),
          signature: signatureWithHashType
        }]
      });
    }

    // Finalize the PSBT
    psbt.finalizeAllInputs();

    // Extract transaction
    const tx = psbt.extractTransaction();

    return {
      chainType: 'bitcoin',
      txHex: tx.toHex(),
      txId: tx.getId(),
      fee: unsignedTx.fee,
      inputs: unsignedTx.inputs,
      changeAddress: unsignedTx.changeAddress,
      changeAmount: unsignedTx.changeAmount
    };
  }
}

class BitcoinTransactionBroadcaster {
  constructor(private bitcoinClient: BitcoinClient) {}

  // Broadcast transaction
  async broadcastTransaction(signedTx: SignedTransaction): Promise<string> {
    const txHex = signedTx.txHex;
    const txId = await this.bitcoinClient.broadcastTransaction(txHex);
    return txId;
  }
}
```

## Avalanche X-Chain Implementation

### UTXO Manager

```typescript
class AvaxUTXOManager {
  constructor(
    private avalancheClient: AvalancheClient,
    private database: UTXODatabase,
    private config: AvaxConfig
  ) {}

  // Refresh UTXOs from the network
  async refreshUTXOs(): Promise<void> {
    const addresses = this.config.teleporterAddresses;

    // Setup Avalanche client
    const avalanche = this.avalancheClient.getAvalanche();
    const xchain = avalanche.XChain();

    try {
      // Get UTXOs for all addresses
      const utxoSet = await xchain.getUTXOs(addresses);
      const utxos = utxoSet.utxos.getAllUTXOs();

      for (const utxo of utxos) {
        const txId = utxo.getTxID().toString('hex');
        const outputIndex = utxo.getOutputIdx();
        const assetID = utxo.getAssetID().toString('hex');
        const output = utxo.getOutput();
        const amount = output.getAmount().toString();
        const addresses = output.getAddresses().map(addr =>
          avalanche.XChain().addressFromBuffer(addr).toString()
        );

        // Get transaction status for confirmations
        const txStatus = await xchain.getTxStatus(txId);

        // Store or update in database
        const existingUTXO = await this.database.getUTXO('avalanche-x', txId, outputIndex);

        if (!existingUTXO) {
          await this.database.addUTXO({
            txId,
            outputIndex,
            amount,
            address: addresses[0], // Use first address
            chainType: 'avalanche-x',
            assetID,
            confirmations: txStatus.status === 'Accepted' ? 1 : 0,
            status: 'available'
          });
        } else {
          // Update confirmations
          await this.database.updateUTXO(
            'avalanche-x',
            txId,
            outputIndex,
            {
              confirmations: txStatus.status === 'Accepted' ? 1 : 0
            }
          );
        }
      }
    } catch (error) {
      console.error('Error refreshing X-Chain UTXOs:', error);
      throw error;
    }
  }

  // Select UTXOs for withdrawal
  async selectUTXOs(amount: string, assetID: string): Promise<UTXO[]> {
    const amountBN = new BN(amount);

    // Get available UTXOs for the specified asset
    const availableUTXOs = await this.database.getAvailableUTXOs(
      'avalanche-x',
      assetID
    );

    // Ensure UTXOs have enough confirmations
    const confirmedUTXOs = availableUTXOs.filter(
      utxo => utxo.confirmations >= this.config.minConfirmations
    );

    // Sort UTXOs by amount (ascending)
    confirmedUTXOs.sort((a, b) => {
      const aBN = new BN(a.amount);
      const bBN = new BN(b.amount);
      return aBN.cmp(bBN);
    });

    // Try to find an exact match first
    const exactMatch = confirmedUTXOs.find(utxo => new BN(utxo.amount).eq(amountBN));
    if (exactMatch) {
      return [exactMatch];
    }

    // Otherwise, use greedy selection
    const selectedUTXOs: UTXO[] = [];
    let selectedAmount = new BN(0);

    for (const utxo of confirmedUTXOs) {
      selectedUTXOs.push(utxo);
      selectedAmount = selectedAmount.add(new BN(utxo.amount));

      if (selectedAmount.gte(amountBN)) {
        break;
      }
    }

    // Check if we have enough
    if (selectedAmount.lt(amountBN)) {
      throw new Error(`Insufficient funds: needed ${amount}, have ${selectedAmount.toString()}`);
    }

    return selectedUTXOs;
  }
}
```

### Transaction Building

```typescript
class AvaxTransactionBuilder {
  constructor(
    private avalancheClient: AvalancheClient,
    private config: AvaxConfig
  ) {}

  // Build transaction for withdrawal
  async buildWithdrawalTransaction(
    utxos: UTXO[],
    destinationAddress: string,
    amount: string,
    changeAddress: string
  ): Promise<UnsignedTransaction> {
    const avalanche = this.avalancheClient.getAvalanche();
    const xchain = avalanche.XChain();
    const bintools = avalanche.BinTools();

    // Convert amounts to BN
    const amountBN = new BN(amount);

    // Get fee
    const fee = xchain.getTxFee();

    // Create UTXOSet
    const utxoSet = new avalanche.avm.UTXOSet();

    // Add UTXOs to the set
    for (const utxo of utxos) {
      const txid = Buffer.from(utxo.txId, 'hex');
      const outputIdx = utxo.outputIndex;
      const assetID = Buffer.from(utxo.assetID, 'hex');

      // Create output
      const output = new avalanche.avm.SECPTransferOutput(
        new BN(utxo.amount),
        [bintools.stringToAddress(utxo.address)]
      );

      // Create UTXO
      const avaxUtxo = new avalanche.avm.UTXO(
        avalanche.avm.UTXOClass,
        txid,
        outputIdx,
        assetID,
        output
      );

      // Add to set
      utxoSet.add(avaxUtxo);
    }

    // Calculate total input amount
    const totalInput = utxos.reduce(
      (sum, utxo) => sum.add(new BN(utxo.amount)),
      new BN(0)
    );

    // Calculate change amount
    const changeAmount = totalInput.sub(amountBN).sub(fee);

    // Create transaction
    const unsignedTx = await xchain.buildBaseTx(
      utxoSet,
      amountBN,
      Buffer.from(utxos[0].assetID, 'hex'), // Use asset ID from first UTXO
      [destinationAddress],
      [changeAddress],
      [changeAddress]
    );

    return {
      chainType: 'avalanche-x',
      unsignedTx,
      inputs: utxos,
      fee: fee.toString(),
      changeAddress,
      changeAmount: changeAmount.toString()
    };
  }

  // Build transaction for sweeping
  async buildSweepTransaction(
    utxos: UTXO[],
    destinationAddress: string
  ): Promise<UnsignedTransaction> {
    const avalanche = this.avalancheClient.getAvalanche();
    const xchain = avalanche.XChain();
    const bintools = avalanche.BinTools();

    // Group UTXOs by asset ID
    const utxosByAsset = new Map<string, UTXO[]>();

    for (const utxo of utxos) {
      if (!utxosByAsset.has(utxo.assetID)) {
        utxosByAsset.set(utxo.assetID, []);
      }
      utxosByAsset.get(utxo.assetID).push(utxo);
    }

    // Process each asset group
    const assetGroups: UnsignedTransaction[] = [];

    for (const [assetID, assetUTXOs] of utxosByAsset.entries()) {
      // Create UTXOSet
      const utxoSet = new avalanche.avm.UTXOSet();

      // Add UTXOs to the set
      for (const utxo of assetUTXOs) {
        const txid = Buffer.from(utxo.txId, 'hex');
        const outputIdx = utxo.outputIndex;
        const asset = Buffer.from(utxo.assetID, 'hex');

        // Create output
        const output = new avalanche.avm.SECPTransferOutput(
          new BN(utxo.amount),
          [bintools.stringToAddress(utxo.address)]
        );

        // Create UTXO
        const avaxUtxo = new avalanche.avm.UTXO(
          avalanche.avm.UTXOClass,
          txid,
          outputIdx,
          asset,
          output
        );

        // Add to set
        utxoSet.add(avaxUtxo);
      }

      // Calculate total input amount
      const totalInput = assetUTXOs.reduce(
        (sum, utxo) => sum.add(new BN(utxo.amount)),
        new BN(0)
      );

      // Get fee
      const fee = xchain.getTxFee();

      // For non-AVAX assets, we need extra AVAX to pay fees
      if (assetID !== this.avalancheClient.getAvaxAssetID()) {
        // This requires having AVAX UTXOs available
        // Implementation depends on your fee handling strategy
        // For simplicity, we'll assume fee is handled separately
      }

      // Build transaction (subtract fee only for AVAX assets)
      const outputAmount = assetID === this.avalancheClient.getAvaxAssetID()
        ? totalInput.sub(fee)
        : totalInput;

      // Create transaction
      const unsignedTx = await xchain.buildBaseTx(
        utxoSet,
        outputAmount,
        Buffer.from(assetID, 'hex'),
        [destinationAddress],
        [destinationAddress],
        [destinationAddress]
      );

      assetGroups.push({
        chainType: 'avalanche-x',
        unsignedTx,
        inputs: assetUTXOs,
        fee: fee.toString(),
        changeAddress: null,
        changeAmount: '0'
      });
    }

    // For simplicity, we'll return the first asset group
    // In practice, you'd process each group separately
    return assetGroups[0];
  }
}
```

### Avalanche Signing and Broadcasting

```typescript
class AvaxTransactionSigner {
  constructor(
    private mpcService: MultiChainMPCSigner,
    private config: AvaxConfig
  ) {}

  // Sign transaction
  async signTransaction(unsignedTx: UnsignedTransaction): Promise<SignedTransaction> {
    const avalanche = this.avalancheClient.getAvalanche();
    const xchain = avalanche.XChain();

    // Get the transaction buffer to sign
    const unsignedBuffer = unsignedTx.unsignedTx.toBuffer();

    // Create message to sign
    const msgToSign = Buffer.from(unsignedBuffer);

    // Sign with MPC
    const signature = await this.mpcService.signDigest(
      msgToSign,
      'avalanche-x'
    );

    // Create credentials
    const cred = new avalanche.avm.Credential();
    cred.addSignature(signature);

    // Sign transaction
    const signedTx = new avalanche.avm.Tx(
      unsignedTx.unsignedTx,
      [cred]
    );

    return {
      chainType: 'avalanche-x',
      signedTx,
      txId: signedTx.getTxID().toString('hex'),
      fee: unsignedTx.fee,
      inputs: unsignedTx.inputs,
      changeAddress: unsignedTx.changeAddress,
      changeAmount: unsignedTx.changeAmount
    };
  }
}

class AvaxTransactionBroadcaster {
  constructor(private avalancheClient: AvalancheClient) {}

  // Broadcast transaction
  async broadcastTransaction(signedTx: SignedTransaction): Promise<string> {
    const avalanche = this.avalancheClient.getAvalanche();
    const xchain = avalanche.XChain();

    // Get transaction buffer
    const txBuffer = signedTx.signedTx.toBuffer();

    // Issue transaction
    const txId = await xchain.issueTx(txBuffer);

    return txId;
  }
}
```

## MPC Signing System

```typescript
enum ChainType {
  BITCOIN = 'bitcoin',
  AVALANCHE_X = 'avalanche-x'
}

// Signature format for different chains
enum SignatureFormat {
  DER = 'der',
  COMPACT = 'compact',
  CB58 = 'cb58'
}

// MPC signing request
interface SigningRequest {
  digest: Buffer;
  chainType: ChainType;
  format: SignatureFormat;
}

// MPC signature share
interface SignatureShare {
  index: number;
  value: Buffer;
}

// MPC node interface
interface MPCNode {
  nodeId: string;
  generateSignatureShare(request: SigningRequest): Promise<SignatureShare>;
}

class MultiChainMPCSigner {
  constructor(
    private mpcNodes: MPCNode[],
    private threshold: number,
    private config: MPCConfig
  ) {}

  // Sign a digest for a specific chain type
  async signDigest(digest: Buffer, chainType: ChainType): Promise<Buffer> {
    // Format signing request based on chain type
    const format = this.getSignatureFormat(chainType);
    const signingRequest: SigningRequest = {
      digest,
      chainType,
      format
    };

    // Collect signature shares from MPC nodes
    const signaturePromises = this.mpcNodes.map(node =>
      node.generateSignatureShare(signingRequest)
    );

    // Wait for all nodes or until threshold is reached
    const signatureShares = await this.collectShares(signaturePromises);

    // Check if we have enough shares
    if (signatureShares.length < this.threshold) {
      throw new Error(`Not enough signature shares: got ${signatureShares.length}, need ${this.threshold}`);
    }

    // Combine shares to get the final signature
    return this.combineShares(signatureShares, chainType);
  }

  // Get the appropriate signature format for the chain
  private getSignatureFormat(chainType: ChainType): SignatureFormat {
    switch (chainType) {
      case ChainType.BITCOIN:
        return SignatureFormat.DER;
      case ChainType.AVALANCHE_X:
        return SignatureFormat.CB58;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  // Collect signature shares with timeout
  private async collectShares(promises: Promise<SignatureShare>[]): Promise<SignatureShare[]> {
    const timeout = this.config.nodeTimeout;

    // Create promises with timeout
    const promisesWithTimeout = promises.map(async (promise) => {
      try {
        return await Promise.race([
          promise,
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);
      } catch (error) {
        console.error('Error collecting signature share:', error);
        return null;
      }
    });

    // Wait for all promises
    const results = await Promise.all(promisesWithTimeout);

    // Filter out null results
    return results.filter(share => share !== null);
  }

  // Combine signature shares based on chain type
  private combineShares(shares: SignatureShare[], chainType: ChainType): Buffer {
    switch (chainType) {
      case ChainType.BITCOIN:
        return this.combineBitcoinShares(shares);
      case ChainType.AVALANCHE_X:
        return this.combineAvaxShares(shares);
      default:
        throw new Error(`Unsupported chain type for combining shares: ${chainType}`);
    }
  }

  // Implement threshold signature combining for Bitcoin
  private combineBitcoinShares(shares: SignatureShare[]): Buffer {
    // Implementation depends on your MPC algorithm
    // This is a simplified placeholder

    // Sort shares by index
    shares.sort((a, b) => a.index - b.index);

    // Combine shares using Lagrange interpolation
    // This is simplified - actual implementation depends on your MPC protocol

    // Return DER encoded signature
    return Buffer.from('combined_bitcoin_signature', 'hex');
  }

  // Implement threshold signature combining for Avalanche X-Chain
  private combineAvaxShares(shares: SignatureShare[]): Buffer {
    // Similar to Bitcoin but with Avalanche-specific formatting

    // Return CB58 encoded signature
    return Buffer.from('combined_avax_signature', 'hex');
  }

  // Generate a new MPC key (for sweeping or key rotation)
  async generateKey(): Promise<{publicKey: Buffer, keyId: string}> {
    // Implementation depends on your MPC protocol
    // This is a simplified placeholder

    // Return the public key and an identifier for the key
    return {
      publicKey: Buffer.from('mpc_generated_public_key', 'hex'),
      keyId: 'key_' + Date.now()
    };
  }
}
```

## Common Utilities

### Address Generator

```typescript
class AddressGenerator {
  constructor(
    private mpcService: MultiChainMPCSigner,
    private database: Database,
    private config: AddressConfig
  ) {}

  // Generate address for a specific chain
  async generateAddress(chainType: ChainType, purpose: string): Promise<string> {
    // Generate random index for added security
    const randomIndex = crypto.randomBytes(8).readBigUInt64BE(0).toString();

    // Get path based on chain and purpose
    const path = this.getDerivationPath(chainType, purpose, randomIndex);

    // Generate key for this path
    const { publicKey, keyId } = await this.mpcService.generateKey();

    // Format address based on chain type
    let address: string;

    switch (chainType) {
      case ChainType.BITCOIN:
        address = this.createBitcoinAddress(publicKey);
        break;
      case ChainType.AVALANCHE_X:
        address = this.createAvaxAddress(publicKey);
        break;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }

    // Store address in database
    await this.database.storeAddress({
      address,
      chainType,
      purpose,
      path,
      keyId,
      publicKey: publicKey.toString('hex'),
      createdAt: Date.now()
    });

    return address;
  }

  // Get derivation path for specific chain and purpose
  private getDerivationPath(chainType: ChainType, purpose: string, index: string): string {
    const purposeCode = this.getPurposeCode(purpose);

    switch (chainType) {
      case ChainType.BITCOIN:
        // BIP44: m/purpose'/coin_type'/account'/change/address_index
        return `m/44'/0'/0'/${purposeCode}/${index}`;
      case ChainType.AVALANCHE_X:
        // Avalanche uses m/44'/9000'/0'/0/address_index
        return `m/44'/9000'/0'/${purposeCode}/${index}`;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  // Get purpose code for path
  private getPurposeCode(purpose: string): number {
    switch (purpose) {
      case 'deposit':
        return 0;
      case 'change':
        return 1;
      case 'sweep':
        return 2;
      default:
        return 0;
    }
  }

  // Create Bitcoin address from public key
  private createBitcoinAddress(publicKey: Buffer): string {
    const bitcoinjs = require('bitcoinjs-lib');
    const network = this.config.bitcoin.network === 'mainnet'
      ? bitcoinjs.networks.bitcoin
      : bitcoinjs.networks.testnet;

    // Create P2WPKH address (Segwit)
    const { address } = bitcoinjs.payments.p2wpkh({
      pubkey: publicKey,
      network
    });

    return address;
  }

  // Create Avalanche X address from public key
  private createAvaxAddress(publicKey: Buffer): string {
    const avalanche = require('avalanche');
    const bintools = avalanche.BinTools.getInstance();

    // Create X-Chain address
    const chainId = 'X';
    const hrp = this.config.avalanche.network === 'mainnet' ? 'X-avax' : 'X-fuji';

    // Create address from public key
    const addr = avalanche.Address.fromPublicKey(publicKey);

    // Format with correct chainID and prefix
    return addr.toString(hrp, chainId);
  }

  // Generate a deposit address
  async generateDepositAddress(chainType: ChainType): Promise<string> {
    return this.generateAddress(chainType, 'deposit');
  }

  // Generate a change address
  async generateChangeAddress(chainType: ChainType): Promise<string> {
    return this.generateAddress(chainType, 'change');
  }

  // Generate a sweep address
  async generateSweepAddress(chainType: ChainType): Promise<string> {
    return this.generateAddress(chainType, 'sweep');
  }
}
```

### Sweep Manager

```typescript
class SweepManager {
  constructor(
    private chainHandlers: Map<string, ChainHandler>,
    private addressGenerator: AddressGenerator,
    private database: Database,
    private config: SweepConfig
  ) {}

  // Check if sweeping is needed for a chain
  async shouldSweep(chainType: string): Promise<boolean> {
    // Get handler for this chain
    const handler = this.chainHandlers.get(chainType);
    if (!handler) {
      throw new Error(`No handler for chain type: ${chainType}`);
    }

    // Get last sweep time
    const lastSweep = await this.database.getLastSweep(chainType);
    const now = Date.now();

    // Get available UTXOs
    const availableUTXOs = await this.database.getAvailableUTXOs(chainType);

    // Calculate total value
    let totalValue: BigInt | BN;

    if (chainType === ChainType.BITCOIN) {
      totalValue = availableUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.amount),
        BigInt(0)
      );

      // Convert to object for consistency in logic below
      totalValue = { valueOf: () => totalValue };
    } else {
      totalValue = availableUTXOs.reduce(
        (sum, utxo) => sum.add(new BN(utxo.amount)),
        new BN(0)
      );
    }

    // Check thresholds
    for (const threshold of this.config.sweepThresholds) {
      if (
        totalValue > threshold.amount &&
        (!lastSweep || (now - lastSweep.timestamp) > threshold.interval)
      ) {
        return true;
      }
    }

    // Default sweep interval
    if (!lastSweep || (now - lastSweep.timestamp) > this.config.defaultSweepInterval) {
      return availableUTXOs.length > 0;
    }

    return false;
  }

  // Execute sweep for a chain
  async executeSweep(chainType: string): Promise<SweepResult> {
    // Get handler for this chain
    const handler = this.chainHandlers.get(chainType);
    if (!handler) {
      throw new Error(`No handler for chain type: ${chainType}`);
    }

    // Get sweepable UTXOs
    const utxos = await handler.getSweepableUTXOs();

    if (utxos.length === 0) {
      return {
        status: 'skipped',
        message: 'No UTXOs to sweep'
      };
    }

    // Generate new sweep address
    const sweepAddress = await this.addressGenerator.generateSweepAddress(chainType);

    // Build sweep transaction
    const unsignedTx = await handler.buildSweepTransaction(utxos, sweepAddress);

    // Sign transaction
    const signedTx = await handler.signTransaction(unsignedTx);

    // Broadcast transaction
    const txId = await handler.broadcastTransaction(signedTx);

    // Update database
    await this.database.recordSweep({
      chainType,
      txId,
      utxos,
      destinationAddress: sweepAddress,
      timestamp: Date.now()
    });

    // Mark UTXOs as spent
    for (const utxo of utxos) {
      await this.database.updateUTXO(
        chainType,
        utxo.txId,
        utxo.outputIndex,
        {
          status: 'spent',
          spentAt: Date.now(),
          spentInTxId: txId
        }
      );
    }

    return {
      status: 'success',
      txId,
      utxoCount: utxos.length,
      destinationAddress: sweepAddress
    };
  }
}
```

## Configuration Examples

### Bitcoin Configuration

```typescript
const bitcoinConfig = {
  // Network settings
  network: 'mainnet', // or 'testnet'

  // Node connection
  nodeUrl: 'https://bitcoin-rpc.example.com',
  nodeUsername: 'rpc_user',
  nodePassword: 'rpc_password',

  // Teleporter addresses
  teleporterAddresses: [
    'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'bc1qyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
  ],

  // Transaction settings
  feeRate: 5, // satoshis per vByte
  dustThreshold: 546, // minimum output value in satoshis
  minConfirmations: 3, // minimum confirmations for using UTXOs

  // MPC settings
  publicKey: '03xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',

  // Sweep settings
  sweepThresholds: [
    { amount: 1000000, interval: 24 * 60 * 60 * 1000 }, // 0.01 BTC, 24 hours
    { amount: 10000000, interval: 12 * 60 * 60 * 1000 }, // 0.1 BTC, 12 hours
    { amount: 100000000, interval: 4 * 60 * 60 * 1000 } // 1 BTC, 4 hours
  ],
  defaultSweepInterval: 48 * 60 * 60 * 1000, // 48 hours

  // Processing intervals
  refreshInterval: 5 * 60 * 1000, // 5 minutes
  withdrawalProcessingInterval: 1 * 60 * 1000, // 1 minute
  sweepCheckInterval: 30 * 60 * 1000 // 30 minutes
};
```

### Avalanche X-Chain Configuration

```typescript
const avalancheConfig = {
  // Network settings
  network: 'mainnet', // or 'fuji'

  // Node connection
  nodeUrl: 'https://api.avax.network',
  nodePort: 443,
  protocol: 'https',
  networkID: 1, // 1 for mainnet, 5 for fuji testnet

  // Teleporter addresses
  teleporterAddresses: [
    'X-avax1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'X-avax1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
  ],

  // Transaction settings
  minConfirmations: 1, // X-Chain has fast finality

  // MPC settings
  publicKey: '03xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',

  // Sweep settings
  sweepThresholds: [
    { amount: new BN('10000000000'), interval: 24 * 60 * 60 * 1000 }, // 10 AVAX, 24 hours
    { amount: new BN('100000000000'), interval: 12 * 60 * 60 * 1000 }, // 100 AVAX, 12 hours
    { amount: new BN('1000000000000'), interval: 4 * 60 * 60 * 1000 } // 1000 AVAX, 4 hours
  ],
  defaultSweepInterval: 48 * 60 * 60 * 1000, // 48 hours

  // Processing intervals
  refreshInterval: 2 * 60 * 1000, // 2 minutes
  withdrawalProcessingInterval: 30 * 1000, // 30 seconds
  sweepCheckInterval: 15 * 60 * 1000 // 15 minutes
};
```

### MPC Configuration

```typescript
const mpcConfig = {
  // Node settings
  nodes: [
    { id: 'node1', url: 'https://mpc-node1.example.com' },
    { id: 'node2', url: 'https://mpc-node2.example.com' },
    { id: 'node3', url: 'https://mpc-node3.example.com' },
    { id: 'node4', url: 'https://mpc-node4.example.com' },
    { id: 'node5', url: 'https://mpc-node5.example.com' }
  ],
  threshold: 3, // Minimum nodes needed to sign

  // Security settings
  nodeTimeout: 30000, // 30 seconds timeout for node responses

  // Key rotation
  keyRotationInterval: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Retry settings
  maxRetries: 3,
  retryDelay: 5000 // 5 seconds
};
```

### Database Configuration

```typescript
const databaseConfig = {
  // PostgreSQL connection
  host: 'db.example.com',
  port: 5432,
  database: 'utxo_manager',
  user: 'db_user',
  password: 'db_password',

  // Connection pool
  poolSize: 10,

  // Indexes
  createIndexes: true,

  // Logging
  logQueries: false,

  // Auto-cleanup
  cleanupInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
  retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
};
```

## API Endpoints

```typescript
// API Endpoints for the Withdrawal System
class UTXOWithdrawalAPI {
  constructor(
    private withdrawalProcessor: WithdrawalProcessor,
    private sweepManager: SweepManager,
    private addressGenerator: AddressGenerator,
    private database: Database
  ) {}

  // Initialize API routes
  initializeRoutes(app: Express): void {
    // Withdrawal endpoints
    app.post('/api/v1/withdrawal', this.createWithdrawal.bind(this));
    app.get('/api/v1/withdrawal/:id', this.getWithdrawalStatus.bind(this));

    // UTXO management
    app.get('/api/v1/utxos/:chainType', this.getUtxoStatus.bind(this));

    // Address generation
    app.post('/api/v1/address/:chainType', this.generateAddress.bind(this));

    // Sweep management
    app.post('/api/v1/sweep/:chainType', this.triggerSweep.bind(this));
    app.get('/api/v1/sweep/:chainType/history', this.getSweepHistory.bind(this));
  }

  // Create a new withdrawal request
  async createWithdrawal(req: Request, res: Response): Promise<void> {
    try {
      const {
        chainType,
        destinationAddress,
        amount,
        assetID = null,
        feeRate = null,
        userId
      } = req.body;

      // Validate request
      this.validateWithdrawalRequest(chainType, destinationAddress, amount);

      // Create request ID
      const requestId = crypto.randomBytes(16).toString('hex');

      // Store withdrawal request
      await this.database.createWithdrawalRequest({
        id: requestId,
        chainType,
        destinationAddress,
        amount,
        assetID,
        feeRate,
        userId,
        status: 'pending',
        createdAt: Date.now()
      });

      // Return request ID
      res.status(200).json({
        status: 'success',
        data: {
          requestId,
          estimatedCompletionTime: this.getEstimatedCompletionTime(chainType)
        }
      });
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      res.status(400).json({
        status: 'error',
        message: error.message
      });
    }
  }

  // Get withdrawal status
  async getWithdrawalStatus(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.params.id;

      // Get withdrawal from database
      const withdrawal = await this.database.getWithdrawalRequest(requestId);

      if (!withdrawal) {
        res.status(404).json({
          status: 'error',
          message: 'Withdrawal request not found'
        });
        return;
      }

      // Get transaction details if available
      let txDetails = null;
      if (withdrawal.txId) {
        txDetails = await this.getTransactionDetails(
          withdrawal.chainType,
          withdrawal.txId
        );
      }

      res.status(200).json({
        status: 'success',
        data: {
          requestId: withdrawal.id,
          chainType: withdrawal.chainType,
          destinationAddress: withdrawal.destinationAddress,
          amount: withdrawal.amount,
          status: withdrawal.status,
          txId: withdrawal.txId,
          txDetails,
          createdAt: withdrawal.createdAt,
          processedAt: withdrawal.processedAt
        }
      });
    } catch (error) {
      console.error('Error getting withdrawal status:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error fetching withdrawal status'
      });
    }
  }

  // Trigger a sweep operation
  async triggerSweep(req: Request, res: Response): Promise<void> {
    try {
      const chainType = req.params.chainType;

      // Check if sweeping is needed
      const shouldSweep = await this.sweepManager.shouldSweep(chainType);

      if (!shouldSweep) {
        res.status(200).json({
          status: 'success',
          data: {
            message: 'Sweep not needed at this time'
          }
        });
        return;
      }

      // Execute sweep
      const result = await this.sweepManager.executeSweep(chainType);

      res.status(200).json({
        status: 'success',
        data: result
      });
    } catch (error) {
      console.error('Error triggering sweep:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error triggering sweep'
      });
    }
  }

  // Get UTXO status for a chain
  async getUtxoStatus(req: Request, res: Response): Promise<void> {
    try {
      const chainType = req.params.chainType;

      // Get UTXOs from database
      const utxos = await this.database.getAllUTXOs(chainType);

      // Group by status
      const available = utxos.filter(utxo => utxo.status === 'available');
      const reserved = utxos.filter(utxo => utxo.status === 'reserved');
      const spent = utxos.filter(utxo => utxo.status === 'spent');

      // Calculate totals
      const calculateTotal = (utxos: UTXO[]): string => {
        if (chainType === 'bitcoin') {
          return utxos
            .reduce((sum, utxo) => sum + BigInt(utxo.amount), BigInt(0))
            .toString();
        } else {
          return utxos
            .reduce((sum, utxo) => sum.add(new BN(utxo.amount)), new BN(0))
            .toString();
        }
      };

      res.status(200).json({
        status: 'success',
        data: {
          available: {
            count: available.length,
            total: calculateTotal(available)
          },
          reserved: {
            count: reserved.length,
            total: calculateTotal(reserved)
          },
          spent: {
            count: spent.length,
            total: calculateTotal(spent)
          },
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting UTXO status:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error fetching UTXO status'
      });
    }
  }

  // Generate a new address
  async generateAddress(req: Request, res: Response): Promise<void> {
    try {
      const chainType = req.params.chainType;
      const purpose = req.query.purpose || 'deposit';

      // Generate address
      const address = await this.addressGenerator.generateAddress(chainType, purpose.toString());

      res.status(200).json({
        status: 'success',
        data: {
          address,
          chainType,
          purpose
        }
      });
    } catch (error) {
      console.error('Error generating address:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error generating address'
      });
    }
  }

  // Get sweep history
  async getSweepHistory(req: Request, res: Response): Promise<void> {
    try {
      const chainType = req.params.chainType;
      const limit = parseInt(req.query.limit?.toString() || '10');
      const offset = parseInt(req.query.offset?.toString() || '0');

      // Get sweep history from database
      const sweeps = await this.database.getSweepHistory(chainType, limit, offset);

      res.status(200).json({
        status: 'success',
        data: {
          sweeps,
          pagination: {
            limit,
            offset,
            total: await this.database.countSweeps(chainType)
          }
        }
      });
    } catch (error) {
      console.error('Error getting sweep history:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error fetching sweep history'
      });
    }
  }

  // Helper method to validate withdrawal request
  private validateWithdrawalRequest(
    chainType: string,
    destinationAddress: string,
    amount: string
  ): void {
    // Validate chain type
    if (!['bitcoin', 'avalanche-x'].includes(chainType)) {
      throw new Error(`Unsupported chain type: ${chainType}`);
    }

    // Validate address
    if (chainType === 'bitcoin') {
      if (!this.isValidBitcoinAddress(destinationAddress)) {
        throw new Error('Invalid Bitcoin address');
      }
    } else if (chainType === 'avalanche-x') {
      if (!this.isValidAvaxAddress(destinationAddress)) {
        throw new Error('Invalid Avalanche X-Chain address');
      }
    }

    // Validate amount
    try {
      if (chainType === 'bitcoin') {
        const amountValue = BigInt(amount);
        if (amountValue <= BigInt(0)) {
          throw new Error('Amount must be greater than 0');
        }
      } else {
        const amountValue = new BN(amount);
        if (amountValue.lte(new BN(0))) {
          throw new Error('Amount must be greater than 0');
        }
      }
    } catch (error) {
      throw new Error('Invalid amount format');
    }
  }

  // Helper method to get estimated completion time
  private getEstimatedCompletionTime(chainType: string): string {
    const now = new Date();

    // Add estimated processing time based on chain type
    if (chainType === 'bitcoin') {
      // Bitcoin takes longer
      now.setMinutes(now.getMinutes() + 30);
    } else if (chainType === 'avalanche-x') {
      // Avalanche is faster
      now.setMinutes(now.getMinutes() + 5);
    } else {
      // Default
      now.setMinutes(now.getMinutes() + 15);
    }

    return now.toISOString();
  }

  // Helper method to get transaction details
  private async getTransactionDetails(
    chainType: string,
    txId: string
  ): Promise<any> {
    const handler = this.withdrawalProcessor.getChainHandler(chainType);
    if (!handler) {
      throw new Error(`No handler for chain type: ${chainType}`);
    }

    return handler.getTransactionStatus(txId);
  }

  // Helper method to validate Bitcoin address
  private isValidBitcoinAddress(address: string): boolean {
    try {
      const bitcoinjs = require('bitcoinjs-lib');
      const network = this.withdrawalProcessor.getConfig('bitcoin').network === 'mainnet'
        ? bitcoinjs.networks.bitcoin
        : bitcoinjs.networks.testnet;

      bitcoinjs.address.toOutputScript(address, network);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Helper method to validate Avalanche X-Chain address
  private isValidAvaxAddress(address: string): boolean {
    try {
      // Check if address starts with X-
      if (!address.startsWith('X-')) {
        return false;
      }

      // Additional validation could be done here with Avalanche.js
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

## Error Handling

```typescript
// Define error types
class UTXOError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'UTXOError';
    // Ensure Error.captureStackTrace exists (it's a V8 specific function)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UTXOError);
    }
  }
}

// Specific error types
class InsufficientFundsError extends UTXOError {
  constructor(amount: string, available: string) {
    super(
      `Insufficient funds: requested ${amount}, available ${available}`,
      'INSUFFICIENT_FUNDS',
      { requested: amount, available }
    );
    this.name = 'InsufficientFundsError';
  }
}

class InvalidAddressError extends UTXOError {
  constructor(address: string, chainType: string) {
    super(
      `Invalid address for ${chainType}: ${address}`,
      'INVALID_ADDRESS',
      { address, chainType }
    );
    this.name = 'InvalidAddressError';
  }
}

class UTXONotFoundError extends UTXOError {
  constructor(txId: string, outputIndex: number) {
    super(
      `UTXO not found: ${txId}:${outputIndex}`,
      'UTXO_NOT_FOUND',
      { txId, outputIndex }
    );
    this.name = 'UTXONotFoundError';
  }
}

class TransactionBroadcastError extends UTXOError {
  constructor(message: string, txHex?: string) {
    super(
      `Failed to broadcast transaction: ${message}`,
      'BROADCAST_ERROR',
      { txHex }
    );
    this.name = 'TransactionBroadcastError';
  }
}

class MPCSigningError extends UTXOError {
  constructor(message: string, details?: any) {
    super(
      `MPC signing failed: ${message}`,
      'MPC_SIGNING_ERROR',
      details
    );
    this.name = 'MPCSigningError';
  }
}

// Error handler middleware
function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', error);

  // Set default status code
  let statusCode = 500;
  let errorResponse = {
    status: 'error',
    message: 'Internal server error'
  };

  // Handle specific error types
  if (error instanceof UTXOError) {
    // Map error codes to HTTP status codes
    const statusCodeMap: Record<string, number> = {
      'INSUFFICIENT_FUNDS': 400,
      'INVALID_ADDRESS': 400,
      'UTXO_NOT_FOUND': 404,
      'BROADCAST_ERROR': 500,
      'MPC_SIGNING_ERROR': 500
    };

    statusCode = statusCodeMap[error.code] || 500;

    errorResponse = {
      status: 'error',
      message: error.message,
      code: error.code,
      details: error.details
    };
  } else if (error instanceof SyntaxError) {
    // Handle JSON parsing errors
    statusCode = 400;
    errorResponse = {
      status: 'error',
      message: 'Invalid request format'
    };
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}
```

## Monitoring and Logging

```typescript
// Logger utility
class Logger {
  private logLevel: string;

  constructor(level: string = 'info') {
    this.logLevel = level;
  }

  // Log levels in order of severity
  private levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  // Check if level should be logged
  private shouldLog(level: string): boolean {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  // Format log message
  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaString = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaString}`;
  }

  // Log methods
  error(message: string, meta?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, meta));
    }
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }

  // Transaction logging
  logTransaction(tx: any, status: string): void {
    this.info(`Transaction ${status}`, {
      txId: tx.txId,
      chainType: tx.chainType,
      inputs: tx.inputs?.length,
      status
    });
  }

  // Sweep logging
  logSweep(sweep: any): void {
    this.info(`Sweep executed`, {
      txId: sweep.txId,
      chainType: sweep.chainType,
      utxoCount: sweep.utxos?.length,
      destination: sweep.destinationAddress
    });
  }

  // Error logging
  logError(error: Error, context?: string): void {
    this.error(`${context || 'Error occurred'}: ${error.message}`, {
      name: error.name,
      stack: error.stack
    });
  }
}

// Monitoring system
class MonitoringSystem {
  private metrics: Map<string, number> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;

    // Initialize metrics
    this.initializeMetrics();
  }

  // Initialize default metrics
  private initializeMetrics(): void {
    // Withdrawal metrics
    this.metrics.set('withdrawals_total', 0);
    this.metrics.set('withdrawals_success', 0);
    this.metrics.set('withdrawals_failed', 0);
    this.metrics.set('withdrawals_pending', 0);

    // Sweep metrics
    this.metrics.set('sweeps_total', 0);
    this.metrics.set('sweeps_success', 0);
    this.metrics.set('sweeps_failed', 0);

    // UTXO metrics
    this.metrics.set('utxos_available', 0);
    this.metrics.set('utxos_reserved', 0);
    this.metrics.set('utxos_spent', 0);

    // MPC metrics
    this.metrics.set('mpc_signing_requests', 0);
    this.metrics.set('mpc_signing_success', 0);
    this.metrics.set('mpc_signing_failed', 0);

    // Performance metrics
    this.metrics.set('avg_withdrawal_time_ms', 0);
    this.metrics.set('avg_sweep_time_ms', 0);
    this.metrics.set('avg_signing_time_ms', 0);
  }

  // Increment a metric
  increment(metric: string, value: number = 1): void {
    const currentValue = this.metrics.get(metric) || 0;
    this.metrics.set(metric, currentValue + value);
  }

  // Set a metric value
  set(metric: string, value: number): void {
    this.metrics.set(metric, value);
  }

  // Get a metric value
  get(metric: string): number {
    return this.metrics.get(metric) || 0;
  }

  // Get all metrics
  getAllMetrics(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    return result;
  }

  // Record withdrawal event
  recordWithdrawal(status: string, durationMs?: number): void {
    this.increment('withdrawals_total');
    this.increment(`withdrawals_${status}`);

    if (durationMs) {
      const avgTime = this.get('avg_withdrawal_time_ms');
      const totalWithdrawals = this.get('withdrawals_total');

      // Update rolling average
      const newAvg = (avgTime * (totalWithdrawals - 1) + durationMs) / totalWithdrawals;
      this.set('avg_withdrawal_time_ms', newAvg);

      this.logger.debug(`Withdrawal completed in ${durationMs}ms`, { status });
    }
  }

  // Record sweep event
  recordSweep(status: string, utxoCount: number, durationMs?: number): void {
    this.increment('sweeps_total');
    this.increment(`sweeps_${status}`);

    if (durationMs) {
      const avgTime = this.get('avg_sweep_time_ms');
      const totalSweeps = this.get('sweeps_total');

      // Update rolling average
      const newAvg = (avgTime * (totalSweeps - 1) + durationMs) / totalSweeps;
      this.set('avg_sweep_time_ms', newAvg);

      this.logger.debug(`Sweep completed in ${durationMs}ms`, {
        status,
        utxoCount
      });
    }
  }

  // Record MPC signing event
  recordMPCSigning(status: string, durationMs?: number): void {
    this.increment('mpc_signing_requests');
    this.increment(`mpc_signing_${status}`);

    if (durationMs) {
      const avgTime = this.get('avg_signing_time_ms');
      const totalSignings = this.get('mpc_signing_requests');

      // Update rolling average
      const newAvg = (avgTime * (totalSignings - 1) + durationMs) / totalSignings;
      this.set('avg_signing_time_ms', newAvg);

      this.logger.debug(`MPC signing completed in ${durationMs}ms`, { status });
    }
  }

  // Update UTXO metrics
  updateUTXOMetrics(
    availableCount: number,
    reservedCount: number,
    spentCount: number
  ): void {
    this.set('utxos_available', availableCount);
    this.set('utxos_reserved', reservedCount);
    this.set('utxos_spent', spentCount);

    this.logger.debug('UTXO metrics updated', {
      available: availableCount,
      reserved: reservedCount,
      spent: spentCount
    });
  }

  // Export metrics in Prometheus format
  exportPrometheusMetrics(): string {
    let output = '';

    for (const [key, value] of this.metrics.entries()) {
      output += `# HELP utxo_system_${key} UTXO withdrawal system metric\n`;
      output += `# TYPE utxo_system_${key} gauge\n`;
      output += `utxo_system_${key} ${value}\n`;
    }

    return output;
  }
}
```

## Security Best Practices

```typescript
// Security utils
class SecurityUtils {
  // Generate a random key
  static generateRandomKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // Hash data with a salt
  static hashWithSalt(data: string, salt?: string): { hash: string, salt: string } {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .createHmac('sha256', useSalt)
      .update(data)
      .digest('hex');

    return { hash, salt: useSalt };
  }

  // Constant-time comparison to prevent timing attacks
  static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  // Validate and sanitize input
  static sanitizeInput(input: string): string {
    // Remove potentially dangerous characters
    return input.replace(/[<>'"&]/g, '');
  }

  // Validate hexadecimal string
  static isValidHex(hex: string): boolean {
    return /^[0-9a-fA-F]+$/.test(hex);
  }

  // Create a secure JWT token
  static createToken(payload: any, secretKey: string, expiresIn: string = '1h'): string {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, secretKey, { expiresIn });
  }

  // Verify a JWT token
  static verifyToken(token: string, secretKey: string): any {
    const jwt = require('jsonwebtoken');
    try {
      return jwt.verify(token, secretKey);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}

// Authentication middleware
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
      throw new Error('JWT_SECRET not configured');
    }

    const decodedToken = SecurityUtils.verifyToken(token, secretKey);

    // Add user to request
    req.user = decodedToken;

    // Continue to next middleware
    next();
  } catch (error) {
    res.status(401).json({
      status: 'error',
      message: 'Invalid authentication token'
    });
  }
}

// Rate limiting middleware
function rateLimitMiddleware(
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100, // 100 requests per window
  message: string = 'Too many requests, please try again later'
): (req: Request, res: Response, next: NextFunction) => void {
  const requestCounts = new Map<string, { count: number, resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Get client IP
    const clientIp = req.ip || 'unknown';

    // Get current time
    const now = Date.now();

    // Get or create request count for this IP
    let requestData = requestCounts.get(clientIp);
    if (!requestData) {
      requestData = {
        count: 0,
        resetTime: now + windowMs
      };
      requestCounts.set(clientIp, requestData);
    }

    // Check if window has expired
    if (now > requestData.resetTime) {
      requestData.count = 0;
      requestData.resetTime = now + windowMs;
    }

    // Increment request count
    requestData.count += 1;

    // Check if count exceeds limit
    if (requestData.count > maxRequests) {
      res.status(429).json({
        status: 'error',
        message
      });
      return;
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - requestData.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(requestData.resetTime / 1000).toString());

    // Continue to next middleware
    next();
  };
}

// CORS middleware
function corsMiddleware(allowedOrigins: string[] = ['*']): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    // Continue to next middleware
    next();
  };
}
```

## Database Schema and Implementation

```typescript
// Database schema using TypeORM
import {
  Entity,
  Column,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';

// UTXO entity
@Entity('utxos')
export class UTXOEntity {
  @PrimaryColumn()
  txId: string;

  @PrimaryColumn()
  outputIndex: number;

  @Column()
  amount: string;

  @Column()
  address: string;

  @Column()
  chainType: string;

  @Column()
  assetID: string;

  @Column({ default: 0 })
  confirmations: number;

  @Column({
    type: 'enum',
    enum: ['available', 'reserved', 'spent'],
    default: 'available'
  })
  status: string;

  @Column({ nullable: true })
  reservedAt: number;

  @Column({ nullable: true })
  spentAt: number;

  @Column({ nullable: true })
  spentInTxId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column()
  createdTimestamp: number;
}

// Withdrawal request entity
@Entity('withdrawal_requests')
export class WithdrawalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  chainType: string;

  @Column()
  destinationAddress: string;

  @Column()
  amount: string;

  @Column({ nullable: true })
  assetID: string;

  @Column({ nullable: true })
  feeRate: string;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  })
  status: string;

  @Column({ nullable: true })
  txId: string;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  processedAt: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column()
  createdTimestamp: number;
}

// Sweep record entity
@Entity('sweep_records')
export class SweepRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  chainType: string;

  @Column()
  txId: string;

  @Column()
  destinationAddress: string;

  @Column({ type: 'simple-json' })
  utxos: string;

  @Column({ nullable: true })
  assetID: string;

  @Column()
  amount: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column()
  timestamp: number;
}

// Address entity
@Entity('addresses')
export class AddressEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  address: string;

  @Column()
  chainType: string;

  @Column()
  purpose: string;

  @Column()
  path: string;

  @Column()
  keyId: string;

  @Column()
  publicKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column()
  createdTimestamp: number;
}

// Database implementation
class TypeORMDatabase implements Database {
  private connection: Connection;
  private logger: Logger;

  constructor(connection: Connection, logger: Logger) {
    this.connection = connection;
    this.logger = logger;
  }

  // UTXO methods
  async addUTXO(utxo: UTXO): Promise<void> {
    try {
      const utxoRepo = this.connection.getRepository(UTXOEntity);

      await utxoRepo.save({
        ...utxo,
        createdTimestamp: Date.now()
      });

      this.logger.debug('Added UTXO', { txId: utxo.txId, outputIndex: utxo.outputIndex });
    } catch (error) {
      this.logger.error('Error adding UTXO', { error, utxo });
      throw error;
    }
  }

  async getUTXO(chainType: string, txId: string, outputIndex: number): Promise<UTXO | null> {
    try {
      const utxoRepo = this.connection.getRepository(UTXOEntity);

      const utxo = await utxoRepo.findOne({
        where: { chainType, txId, outputIndex }
      });

      return utxo || null;
    } catch (error) {
      this.logger.error('Error getting UTXO', { error, chainType, txId, outputIndex });
      throw error;
    }
  }

  async updateUTXO(
    chainType: string,
    txId: string,
    outputIndex: number,
    updates: Partial<UTXO>
  ): Promise<void> {
    try {
      const utxoRepo = this.connection.getRepository(UTXOEntity);

      await utxoRepo.update(
        { chainType, txId, outputIndex },
        updates
      );

      this.logger.debug('Updated UTXO', { txId, outputIndex, updates });
    } catch (error) {
      this.logger.error('Error updating UTXO', { error, chainType, txId, outputIndex, updates });
      throw error;
    }
  }

  async getAvailableUTXOs(chainType: string, assetID?: string): Promise<UTXO[]> {
    try {
      const utxoRepo = this.connection.getRepository(UTXOEntity);

      const whereClause: any = {
        chainType,
        status: 'available'
      };

      if (assetID) {
        whereClause.assetID = assetID;
      }

      return utxoRepo.find({
        where: whereClause,
        order: { confirmations: 'DESC' }
      });
    } catch (error) {
      this.logger.error('Error getting available UTXOs', { error, chainType, assetID });
      throw error;
    }
  }

  // Withdrawal methods
  async createWithdrawalRequest(request: WithdrawalRequest): Promise<void> {
    try {
      const withdrawalRepo = this.connection.getRepository(WithdrawalRequestEntity);

      await withdrawalRepo.save({
        ...request,
        createdTimestamp: Date.now()
      });

      this.logger.info('Created withdrawal request', { id: request.id, amount: request.amount });
    } catch (error) {
      this.logger.error('Error creating withdrawal request', { error, request });
      throw error;
    }
  }

  async getWithdrawalRequest(id: string): Promise<WithdrawalRequest | null> {
    try {
      const withdrawalRepo = this.connection.getRepository(WithdrawalRequestEntity);

      const request = await withdrawalRepo.findOne({
        where: { id }
      });

      return request || null;
    } catch (error) {
      this.logger.error('Error getting withdrawal request', { error, id });
      throw error;
    }
  }

  async updateWithdrawalRequest(
    id: string,
    updates: Partial<WithdrawalRequest>
  ): Promise<void> {
    try {
      const withdrawalRepo = this.connection.getRepository(WithdrawalRequestEntity);

      await withdrawalRepo.update({ id }, updates);

      this.logger.debug('Updated withdrawal request', { id, updates });
    } catch (error) {
      this.logger.error('Error updating withdrawal request', { error, id, updates });
      throw error;
    }
  }

  async getPendingWithdrawals(): Promise<WithdrawalRequest[]> {
    try {
      const withdrawalRepo = this.connection.getRepository(WithdrawalRequestEntity);

      return withdrawalRepo.find({
        where: { status: 'pending' },
        order: { createdTimestamp: 'ASC' }
      });
    } catch (error) {
      this.logger.error('Error getting pending withdrawals', { error });
      throw error;
    }
  }

  // Sweep methods
  async recordSweep(sweep: SweepRecord): Promise<void> {
    try {
      const sweepRepo = this.connection.getRepository(SweepRecordEntity);

      await sweepRepo.save({
        ...sweep,
        utxos: JSON.stringify(sweep.utxos)
      });

      this.logger.info('Recorded sweep', { txId: sweep.txId, utxoCount: sweep.utxos.length });
    } catch (error) {
      this.logger.error('Error recording sweep', { error, sweep });
      throw error;
    }
  }

  async getLastSweep(chainType: string): Promise<SweepRecord | null> {
    try {
      const sweepRepo = this.connection.getRepository(SweepRecordEntity);

      const sweep = await sweepRepo.findOne({
        where: { chainType, status: 'completed' },
        order: { timestamp: 'DESC' }
      });

      if (sweep) {
        sweep.utxos = JSON.parse(sweep.utxos as string);
      }

      return sweep || null;
    } catch (error) {
      this.logger.error('Error getting last sweep', { error, chainType });
      throw error;
    }
  }

  async getSweepHistory(
    chainType: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<SweepRecord[]> {
    try {
      const sweepRepo = this.connection.getRepository(SweepRecordEntity);

      const sweeps = await sweepRepo.find({
        where: { chainType },
        order: { timestamp: 'DESC' },
        take: limit,
        skip: offset
      });

      return sweeps.map(sweep => ({
        ...sweep,
        utxos: JSON.parse(sweep.utxos as string)
      }));
    } catch (error) {
      this.logger.error('Error getting sweep history', { error, chainType });
      throw error;
    }
  }

  async countSweeps(chainType: string): Promise<number> {
    try {
      const sweepRepo = this.connection.getRepository(SweepRecordEntity);

      return sweepRepo.count({
        where: { chainType }
      });
    } catch (error) {
      this.logger.error('Error counting sweeps', { error, chainType });
      throw error;
    }
  }

  // Address methods
  async storeAddress(addressData: AddressData): Promise<void> {
    try {
      const addressRepo = this.connection.getRepository(AddressEntity);

      await addressRepo.save({
        ...addressData,
        createdTimestamp: Date.now()
      });

      this.logger.debug('Stored address', { address: addressData.address, purpose: addressData.purpose });
    } catch (error) {
      this.logger.error('Error storing address', { error, addressData });
      throw error;
    }
  }

  async getAddress(address: string): Promise<AddressData | null> {
    try {
      const addressRepo = this.connection.getRepository(AddressEntity);

      const addressData = await addressRepo.findOne({
        where: { address }
      });

      return addressData || null;
    } catch (error) {
      this.logger.error('Error getting address', { error, address });
      throw error;
    }
  }
}
```

That completes the implementation guide for the multi-chain UTXO withdrawal system. This comprehensive guide covers all the key components needed to build a secure, efficient system for managing withdrawals and automatic sweeping across both Bitcoin and Avalanche X-Chain networks.
