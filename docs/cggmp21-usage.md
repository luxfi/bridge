# CGGMP21 Integration for Lux.Network Bridge

This guide provides instructions for enabling and using the CGGMP21 multi-party computation protocol with the Lux.Network bridge.

## Overview

The CGGMP21 protocol (Canetti, Gennaro, Goldfeder, Makriyannis, Peled, 2021) is an advanced threshold ECDSA implementation with several advantages:

- **Non-Interactive Signing**: Only the last round requires knowledge of the message, allowing preprocessing
- **Adaptive Security**: Withstands adaptive corruption of signatories
- **Proactive Security**: Includes periodic refresh mechanism to maintain security even with compromised nodes
- **Identifiable Abort**: Can identify corrupted signatories in case of failure
- **UC Security Framework**: Proven security guarantees in the Universal Composability framework

## Enabling CGGMP21

To enable CGGMP21 for your MPC nodes, update the following environment variables in your `.env` file:

```
# Enable CGGMP21 protocol
mpc_protocol=cggmp21
party_id=0  # Change according to your node's ID
threshold=2
total_parties=3
key_store_path=./keyshares
use_legacy_signing=false

# Presigning configuration
presign_count=10  # Number of presign data to generate at startup
```

## Protocol Comparison

| Feature | CGGMP20 (Previous) | CGGMP21 (New) |
|---------|-------------------|-------------------|
| Signing Rounds | 4 rounds | 3 rounds (+ 1 non-interactive) |
| Message Dependency | All rounds | Only last round |
| Adaptive Security | Limited | Full support |
| Proactive Security | Basic | Enhanced with refresh |
| Identifiable Abort | Basic | Advanced identification |
| Cold Wallet Support | Limited | Native support |
| UC Security Proof | Partial | Comprehensive |

## Key Components

### 1. Presigning

CGGMP21 uses a presigning phase that generates signing data without knowing the message to be signed. This provides several benefits:

- Faster signing when the message is ready
- Support for offline/cold wallets
- Improved security by separating key operations from message signing

The system will automatically generate presign data at startup (configured by `presign_count`). New presign data is automatically generated in the background when existing data is used.

### 2. Key Refresh

For enhanced security, CGGMP21 supports periodic key refreshing without changing the public key:

```bash
# Manually trigger a key refresh for a new epoch
curl -X POST http://localhost:PORT/api/v1/refresh_keys -d '{"epoch": 1}'
```

After a key refresh, all unused presign data is invalidated and new presign data is generated automatically.

### 3. Non-Interactive Signing

CGGMP21 signing is non-interactive, requiring only a single round of communication after presigning. This makes it ideal for high-performance applications and cold wallet support.

## Best Practices

1. **Regular Key Refreshes**: Schedule regular key refreshes (e.g., weekly) even if no compromise is suspected.

2. **Presign Data Management**: Generate sufficient presign data to handle your expected transaction volume. By default, new presign data is generated when the number of unused entries falls below a threshold.

3. **Security Monitoring**: Monitor for any signs of abnormal behavior or failed signing attempts, which could indicate an attack.

4. **Backup Management**: Ensure your key shares are securely backed up, but never store the shares from multiple nodes together.

## Troubleshooting

Common issues and solutions:

1. **Missing Presign Data**: If you encounter errors about missing presign data, manually trigger generation:

```bash
node dist/generate-presign.js
```

2. **Key Share Issues**: If you're having trouble with key shares, verify the path in your environment variables and ensure the key shares are accessible.

3. **Protocol Mismatch**: Ensure all nodes in your MPC setup are using the same protocol version.

## Migration Guide

To migrate from CGGMP20 to CGGMP21:

1. Update all MPC nodes with the latest code
2. Update environment variables to use CGGMP21
3. Generate new key shares using the CGGMP21 key generation protocol
4. Distribute the key shares to the respective nodes
5. Restart all MPC nodes

Note: You cannot mix CGGMP20 and CGGMP21 nodes in the same MPC setup. All nodes must use the same protocol for a given key.
