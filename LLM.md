# LLM.md - Lux.Network Bridge CGGMP21 Implementation

## Project Overview

This document provides information about the implementation of the CGGMP21 protocol for the Lux.Network bridge. The CGGMP21 protocol is an advanced threshold ECDSA implementation that provides enhanced security features like non-interactive signing, proactive security, and identifiable abort.

## Key Components

### 1. Protocol Management

The implementation is designed to support multiple MPC protocols through a plugin-style architecture:

- `protocol.ts`: Core module that defines protocol interfaces and implementations
- Protocol enum: `GG18`, `CGGMP20`, and `CGGMP21`
- Factory pattern: `createProtocol()` to instantiate the appropriate protocol handler

### 2. CGGMP21 Protocol Features

The CGGMP21 protocol implementation includes:

- **Presigning**: Generate signing data without knowing the message to be signed
- **Key Refresh**: Periodic key refreshing for enhanced security
- **Non-Interactive Signing**: Single round of communication after presigning

### 3. API Endpoints

New endpoints added to support CGGMP21:

- `/api/v1/refresh_keys`: Refresh key shares for enhanced security
- `/api/v1/generate_presign`: Generate presign data manually
- `/api/v1/protocol_status`: Get current protocol status and statistics

### 4. Configuration

Environment variables for configuring the protocol:

```
# Protocol selection
mpc_protocol=cggmp21  # Options: cggmp20, cggmp21

# Party configuration
party_id=0
threshold=2
total_parties=3
key_store_path=./keyshares

# Presigning configuration
presign_count=10  # Number of presign data to generate at startup
```

## Design Decisions

1. **Backward Compatibility**: The implementation maintains backward compatibility with the existing CGGMP20 protocol.

2. **Protocol Abstraction**: An abstract `MPCProtocol` class defines a common interface for all protocol implementations, allowing easy switching between protocols.

3. **Presigning Management**: CGGMP21 includes a system for managing presign data that is generated in advance for better performance and security.

4. **Key Refresh**: CGGMP21 supports periodic key refreshing without changing the public key, enhancing security.

## Implementation Details

### CGGMP21 Protocol Class

The `CGGMP21Protocol` class implements the `MPCProtocol` interface and adds specific methods for CGGMP21:

```typescript
export class CGGMP21Protocol extends MPCProtocol {
  // Core signing method (implements MPCProtocol interface)
  async sign(options: SignOptions): Promise<{ r: string; s: string; v: string; signature: string }>
  
  // CGGMP21-specific methods
  async generatePresignData(): Promise<{ id: string, path: string }>
  async refreshKeyShares(epoch: number): Promise<string>
  async getOrCreatePresignData(): Promise<{ id: string, path: string }>
}
```

### PresignStore

A dedicated store for managing presign data:

```typescript
export class PresignStore {
  async savePresignData(presignData: PresignData): Promise<void>
  async getUnusedPresignData(): Promise<PresignData | null>
  async getUnusedCount(): Promise<number>
  async markPresignDataAsUsed(id: string): Promise<void>
  async markAllAsUsed(): Promise<void>
}
```

### Integration with Existing Signing System

The existing signing system in `utils.ts` was modified to use the protocol handler:

```typescript
// Use protocol handler for signing
const { signature, r, s, v } = await protocolHandler.sign({ messageHash: netSigningMsg });
```

## Usage Flow

1. **Configuration**: Set `mpc_protocol=cggmp21` in environment variables
2. **Initialization**: At startup, the system generates presign data (configured by `presign_count`)
3. **Signing**: When a transaction needs to be signed, the system:
   - Gets or creates presign data
   - Signs the message using the presign data
   - Marks the presign data as used
4. **Maintenance**: Periodically refresh keys using the `/api/v1/refresh_keys` endpoint

## Future Improvements

1. **Automated Key Refreshing**: Implement a scheduled job for regular key refreshing
2. **Better Error Handling**: Improve error handling for protocol operations
3. **Performance Optimization**: Implement batched presigning operations
4. **Monitoring**: Add metrics and monitoring for presign data usage and protocol operations
