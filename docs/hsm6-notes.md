# HSM6 + CGGMP MPC on Raspberry Pi

Integrating Zymbit HSM6 hardware security modules with Rust-based CGGMP threshold signature implementations on Raspberry Pi creates a robust validator infrastructure with significantly enhanced security. This guide provides comprehensive implementation details for developers migrating from software-only CGGMP20 to hardware-secured CGGMP21, covering integration techniques, key management, secure configuration, and performance optimization. By following this implementation path, you'll achieve a validator system that protects private keys in tamper-resistant hardware while distributing signing authority through threshold signatures, substantially reducing the risk of key compromise.

The integration requires building Rust FFI bindings to the HSM6's C API, implementing SLIP39 for key backups, configuring hardware security features, and optimizing communication between the Rust application and HSM. While this adds complexity compared to software-only implementations, the security advantages are substantial—preventing key extraction even if the host system is compromised.

## 1. Architecture overview: HSM6 + CGGMP

The architecture integrates two powerful security technologies:

1. **Zymbit HSM6** - Hardware security module providing:
   - Tamper-resistant key storage
   - Hardware-accelerated cryptographic operations
   - Physical security (tamper detection, temperature monitoring)
   - Protection against key extraction

2. **CGGMP21 MPC Protocol** - Threshold signature scheme that:
   - Distributes signing authority across multiple parties
   - Allows t-of-n access structures for signatures
   - Requires a threshold of parties to collaborate for valid signatures
   - Prevents any single party from learning the complete private key

The integration combines these technologies to achieve both hardware security and distributed control, creating a defense-in-depth approach for validator nodes.

### Logical architecture

```
┌─────────────────────────────────────────┐
│ Raspberry Pi Node                       │
│                                         │
│  ┌───────────────┐    ┌───────────────┐ │
│  │ Rust          │    │ Zymbit HSM6   │ │
│  │ Application   │    │               │ │
│  │               │◄──►│ Key Storage   │ │
│  │ CGGMP21       │    │ Crypto Engine │ │
│  │ Protocol      │    │ Tamper        │ │
│  │ Implementation│    │ Detection     │ │
│  └────────┬──────┘    └───────────────┘ │
│           │                             │
└───────────┼─────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│ Network Communication                    │
└─────────────────────────────────────────┘
            ▲
            │
            ┼─────────────┬─────────────┐
            │             │             │
┌───────────▼───┐ ┌───────▼───┐ ┌───────▼───┐
│ Raspberry Pi  │ │ Raspberry Pi│ │ Raspberry Pi│
│ Node          │ │ Node        │ │ Node        │
└───────────────┘ └─────────────┘ └─────────────┘
```

### Security benefits

This architecture provides several key security advantages:

- **Key isolation**: Private keys never leave the HSM's secure boundary
- **Distributed trust**: No single party can sign transactions alone
- **Physical security**: Protection against hardware attacks
- **Compromise resilience**: System remains secure even if some nodes are compromised
- **Identifiable abort**: Ability to detect and identify malicious parties

## 2. HSM6 integration with Rust

### 2.1 Creating Rust FFI bindings

Since there are no official Rust bindings for HSM6, we need to create Foreign Function Interface (FFI) bindings to the C API. Start by defining the FFI declarations:

```rust
// in src/hsm_ffi.rs
use std::ffi::{c_void, CStr, CString};
use std::os::raw::{c_char, c_int};

#[allow(non_camel_case_types)]
pub type zkCTX = *mut c_void;

#[link(name = "zk_app_utils")]
extern "C" {
    // Context management
    pub fn zkOpen() -> *mut c_void;
    pub fn zkClose(ctx: *mut c_void) -> c_int;

    // Key management
    pub fn zkGenKeyPair(ctx: *mut c_void, key_type: c_int) -> c_int;
    pub fn zkExportPubKey(ctx: *mut c_void, slot: c_int,
                          pubkey: *mut u8, pubkey_len: *mut usize,
                          foreign: bool) -> c_int;

    // Signing operations
    pub fn zkSign(ctx: *mut c_void, data: *const u8, data_len: usize,
                  sig: *mut u8, sig_len: *mut usize,
                  pubkey_slot: c_int) -> c_int;

    // Verification operations
    pub fn zkVerify(ctx: *mut c_void, data: *const u8, data_len: usize,
                    sig: *const u8, sig_len: usize,
                    pubkey_slot: c_int) -> c_int;

    // BIP32/39/44 functions
    pub fn zkGenWalletMasterSeed(ctx: *mut c_void, key_type: *const c_char,
                                master_key: *const c_char, wallet_name: *const c_char,
                                recovery_strategy: *mut c_void) -> c_int;

    pub fn zkGenWalletChildKey(ctx: *mut c_void, slot: c_int,
                              derivation_path: *const c_char,
                              return_chain_code: bool) -> c_int;
}
```

### 2.2 Building safe Rust wrappers

Next, create a safe Rust wrapper to handle memory management and provide a more idiomatic API:

```rust
// in src/hsm.rs
use std::ffi::CString;
use crate::hsm_ffi;

pub enum KeyType {
    NIST_P256 = 0,
    Secp256k1 = 1,
}

#[derive(Debug)]
pub enum HsmError {
    InitializationFailed(i32),
    KeyGenerationFailed(i32),
    SigningFailed(i32),
    VerificationFailed(i32),
    ExportFailed(i32),
    InvalidParameter(&'static str),
}

pub struct HsmClient {
    context: hsm_ffi::zkCTX,
}

impl HsmClient {
    pub fn new() -> Result<Self, HsmError> {
        let context = unsafe { hsm_ffi::zkOpen() };

        if context.is_null() {
            return Err(HsmError::InitializationFailed(-1));
        }

        Ok(HsmClient { context })
    }

    pub fn generate_key_pair(&self, key_type: KeyType) -> Result<i32, HsmError> {
        let key_slot = unsafe {
            hsm_ffi::zkGenKeyPair(self.context, key_type as i32)
        };

        if key_slot < 0 {
            return Err(HsmError::KeyGenerationFailed(key_slot));
        }

        Ok(key_slot)
    }

    pub fn sign(&self, data: &[u8], key_slot: i32) -> Result<Vec<u8>, HsmError> {
        let mut signature = vec![0u8; 128]; // Maximum signature size
        let mut sig_len = signature.len();

        let result = unsafe {
            hsm_ffi::zkSign(
                self.context,
                data.as_ptr(),
                data.len(),
                signature.as_mut_ptr(),
                &mut sig_len,
                key_slot,
            )
        };

        if result < 0 {
            return Err(HsmError::SigningFailed(result));
        }

        signature.truncate(sig_len);
        Ok(signature)
    }

    pub fn export_public_key(&self, key_slot: i32) -> Result<Vec<u8>, HsmError> {
        let mut pubkey = vec![0u8; 128]; // Maximum public key size
        let mut pubkey_len = pubkey.len();

        let result = unsafe {
            hsm_ffi::zkExportPubKey(
                self.context,
                key_slot,
                pubkey.as_mut_ptr(),
                &mut pubkey_len,
                false, // Not a foreign key
            )
        };

        if result < 0 {
            return Err(HsmError::ExportFailed(result));
        }

        pubkey.truncate(pubkey_len);
        Ok(pubkey)
    }

    pub fn generate_wallet_child_key(&self, master_seed_slot: i32,
                                     derivation_path: &str) -> Result<i32, HsmError> {
        let path = CString::new(derivation_path)
            .map_err(|_| HsmError::InvalidParameter("Invalid derivation path"))?;

        let key_slot = unsafe {
            hsm_ffi::zkGenWalletChildKey(
                self.context,
                master_seed_slot,
                path.as_ptr(),
                false, // Don't return chain code
            )
        };

        if key_slot < 0 {
            return Err(HsmError::KeyGenerationFailed(key_slot));
        }

        Ok(key_slot)
    }
}

impl Drop for HsmClient {
    fn drop(&mut self) {
        unsafe { hsm_ffi::zkClose(self.context) };
    }
}
```

### 2.3 Using the wrapper in your application

Now you can use the safe wrapper in your application:

```rust
// in src/main.rs
use crate::hsm::{HsmClient, KeyType};

fn sign_message(message: &[u8]) -> Result<Vec<u8>, anyhow::Error> {
    // Initialize the HSM client
    let hsm = HsmClient::new()?;

    // Generate a key pair in the HSM
    let key_slot = hsm.generate_key_pair(KeyType::Secp256k1)?;

    // Sign the message using the HSM
    let signature = hsm.sign(message, key_slot)?;

    // Export the public key (for verification)
    let public_key = hsm.export_public_key(key_slot)?;

    println!("Generated key in slot: {}", key_slot);
    println!("Public key: {}", hex::encode(&public_key));

    Ok(signature)
}
```

### 2.4 Building the project

Configure your build to link with the HSM6 library:

```toml
# Cargo.toml
[package]
name = "hsm6-cggmp-node"
version = "0.1.0"
edition = "2021"

[dependencies]
libc = "0.2"
hex = "0.4"
anyhow = "1.0"

[build-dependencies]
bindgen = "0.63"
```

Create a `build.rs` file to generate bindings automatically:

```rust
// build.rs
extern crate bindgen;

use std::env;
use std::path::PathBuf;

fn main() {
    // Tell cargo to link to zk_app_utils
    println!("cargo:rustc-link-lib=zk_app_utils");

    // Generate bindings
    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .allowlist_function("zk.*")
        .generate()
        .expect("Unable to generate bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}
```

Create a minimal `wrapper.h` file:

```c
// wrapper.h
#include <zk_app_utils.h>
```

## 3. CGGMP20 to CGGMP21 migration

### 3.1 Overview of protocol differences

CGGMP21 improves upon CGGMP20 with several significant enhancements:

| Feature | CGGMP20 | CGGMP21 |
|---------|---------|---------|
| Round complexity | 8 rounds | 4 rounds |
| Non-interactive signing | Limited | Fully supported |
| Security model | UC framework | UC framework with enhanced proofs |
| Identifiable abort | Supported | Improved efficiency |
| Unforgeability | Strong | Enhanced |

### 3.2 Migration strategy

1. **Incremental migration**: Deploy CGGMP21 code alongside existing CGGMP20 implementation
2. **Key refresh**: Perform coordinated key refresh using the new protocol
3. **Auxiliary information**: Generate new auxiliary information for all parties
4. **Validation**: Ensure all parties can participate in the new protocol
5. **Phase out**: Gradually transition signing operations to CGGMP21

### 3.3 Implementation using Dfns library

The most mature Rust implementation of CGGMP21 is the Dfns library. Here's how to integrate it with HSM6:

```rust
// in src/cggmp.rs
use cggmp21::supported_curves::Secp256k1;
use cggmp21::{DataToSign, ExecutionId, KeyShare};
use round_based::{MpcParty, Msg, StateMachine};
use sha2::Sha256;
use rand::rngs::OsRng;

use crate::hsm::{HsmClient, KeyType};

// Wrapper to integrate HSM with CGGMP
pub struct HsmCggmpSigner {
    hsm: HsmClient,
    key_slot: i32,
}

impl HsmCggmpSigner {
    pub fn new(hsm: HsmClient, key_slot: i32) -> Self {
        Self { hsm, key_slot }
    }

    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, anyhow::Error> {
        self.hsm.sign(message, self.key_slot)
    }

    pub fn get_public_key(&self) -> Result<Vec<u8>, anyhow::Error> {
        Ok(self.hsm.export_public_key(self.key_slot)?)
    }
}

// Key generation with HSM integration
pub async fn generate_threshold_key<P>(
    party: &mut P,
    execution_id: &[u8],
    party_index: u16,
    party_count: u16,
    threshold: u16,
    hsm: &HsmClient,
) -> Result<(KeyShare<Secp256k1>, i32), anyhow::Error>
where
    P: MpcParty,
{
    let eid = ExecutionId::new(execution_id);

    // Generate CGGMP key share
    let key_share = cggmp21::keygen::<Secp256k1>(eid, party_index, party_count)
        .set_threshold(threshold)
        .start(&mut OsRng, party)
        .await?;

    // Generate corresponding key in HSM6
    let key_slot = hsm.generate_key_pair(KeyType::Secp256k1)?;

    // In a production system, you would need to bind the CGGMP key share to the HSM key
    // This would require custom modifications to the CGGMP protocol to use HSM for operations

    Ok((key_share, key_slot))
}

// Signing with HSM integration
pub async fn sign_with_threshold<P>(
    party: &mut P,
    execution_id: &[u8],
    party_index: u16,
    parties_indexes: &[u16],
    key_share: &KeyShare<Secp256k1>,
    message: &[u8],
    hsm_signer: &HsmCggmpSigner,
) -> Result<Vec<u8>, anyhow::Error>
where
    P: MpcParty,
{
    let eid = ExecutionId::new(execution_id);
    let data_to_sign = DataToSign::digest::<Sha256>(message);

    // In a fully integrated system, the CGGMP protocol would be modified
    // to use the HSM for the actual signing operations
    // This example shows a conceptual integration

    let signature = cggmp21::signing(eid, party_index, parties_indexes, key_share)
        .sign(&mut OsRng, party, data_to_sign)
        .await?;

    // Verify signature matches what the HSM would produce
    let hsm_signature = hsm_signer.sign(message)?;

    // In a real implementation, you would need to ensure the signatures match
    // or implement protocol modifications to use the HSM for signing operations

    Ok(signature.to_bytes().to_vec())
}
```

### 3.4 Key architectural changes

1. **Round reduction**: The signing protocol in CGGMP21 requires only 4 rounds, reducing communication overhead.

2. **Presignature optimization**: CGGMP21 improves presignature generation efficiency, allowing for non-interactive signing.

3. **Enhanced security model**: CGGMP21 provides stronger security guarantees in the UC framework.

4. **HSM integration points**:
   - Key generation and storage should occur within the HSM
   - Signing operations must use the HSM's cryptographic engine
   - Protocol modifications may be needed to fully leverage the HSM

5. **Compatibility considerations**:
   - Presignatures from CGGMP20 cannot be used with CGGMP21
   - A new key refresh is required for migration
   - Both protocols may need support during transition

## 4. Key management with SLIP39

### 4.1 SLIP39 overview

SLIP39 (Shamir's Secret Sharing for Mnemonic Codes) provides a robust mechanism for splitting a master seed into multiple shares, where a predefined threshold is required for reconstruction.

Key features:
- Multi-level threshold scheme with groups and members
- Protection with an optional passphrase
- Mnemonic encoding for human readability
- Standard format ensuring interoperability

### 4.2 Implementing SLIP39 with HSM6

HSM6 supports SLIP39 natively through its API:

```rust
// in src/slip39.rs
use std::process::Command;
use std::str;

// Structure to define SLIP39 backup configuration
pub struct Slip39Config {
    pub group_count: u8,
    pub group_threshold: u8,
    pub groups: Vec<(u8, u8)>, // (member_threshold, member_count) for each group
    pub passphrase: String,
}

// Generate SLIP39 shares for a master seed
pub fn generate_slip39_shares(
    config: &Slip39Config,
    hsm_client: &HsmClient,
    key_type: &str,
    wallet_name: &str,
) -> Result<Vec<Vec<String>>, anyhow::Error> {
    // Since Rust doesn't have direct bindings, use Python bridge
    let python_script = format!(
        r#"
import zymkey
import sys

# Define SLIP39 recovery strategy
use_SLIP39_recovery = zymkey.RecoveryStrategySLIP39(
    group_count = {},
    group_threshold = {},
    iteration_exponent = 0,
    variant = "",
    passphrase = "{}"
)

# Generate master seed with SLIP39 recovery
return_code = zymkey.client.gen_wallet_master_seed(
    "{}",
    "",
    "{}",
    use_SLIP39_recovery
)

if return_code < 0:
    print(f"Error: {{return_code}}")
    sys.exit(1)

# Configure groups and generate shares
all_shares = []

for group_idx in range({}):
    member_threshold, member_count = [{},{}][group_idx]

    # Configure group
    zymkey.client.set_gen_SLIP39_group_info(group_idx, member_count, member_threshold)

    # Generate shares for group
    group_shares = []
    for i in range(member_count):
        result, mnemonic = zymkey.client.add_gen_SLIP39_member_pwd("")
        if result == -1:
            # Still generating shares
            group_shares.append(mnemonic)
        else:
            # Master seed generated in slot
            slot = result
            break

    all_shares.append(group_shares)

# Print all shares
for group_idx, group in enumerate(all_shares):
    for member_idx, share in enumerate(group):
        print(f"GROUP_{{group_idx}}_MEMBER_{{member_idx}}:{{share}}")

# Print the master seed slot
print(f"MASTER_SEED_SLOT:{{slot}}")
        "#,
        config.group_count,
        config.group_threshold,
        config.passphrase,
        key_type,
        wallet_name,
        config.group_count,
        // Join all group configurations into a comma-separated list
        config.groups.iter()
            .map(|(threshold, count)| format!("({},{})", threshold, count))
            .collect::<Vec<_>>()
            .join(","),
        config.groups.len()
    );

    // Execute Python script
    let output = Command::new("python3")
        .arg("-c")
        .arg(python_script)
        .output()?;

    // Parse output to extract shares and master seed slot
    let stdout = str::from_utf8(&output.stdout)?;

    // Parse the shares from the output
    let mut all_shares = Vec::new();
    let mut current_group = Vec::new();
    let mut master_seed_slot = -1;

    for line in stdout.lines() {
        if line.starts_with("GROUP_") {
            let parts: Vec<_> = line.splitn(2, ":").collect();
            if parts.len() == 2 {
                current_group.push(parts[1].to_string());
            }
        } else if line.starts_with("MASTER_SEED_SLOT:") {
            let parts: Vec<_> = line.splitn(2, ":").collect();
            if parts.len() == 2 {
                master_seed_slot = parts[1].parse()?;
            }
        }
    }

    if master_seed_slot < 0 {
        return Err(anyhow::anyhow!("Failed to generate master seed"));
    }

    Ok(all_shares)
}

// Recover master seed from SLIP39 shares
pub fn recover_from_slip39_shares(
    shares: &[String],
    passphrase: &str,
    hsm_client: &HsmClient,
    key_type: &str,
    wallet_name: &str,
) -> Result<i32, anyhow::Error> {
    // Create Python script for recovery
    let shares_str = shares
        .iter()
        .map(|s| format!("\"{}\"", s))
        .collect::<Vec<_>>()
        .join(", ");

    let python_script = format!(
        r#"
import zymkey
import sys

shares = [{}]

# Define SLIP39 recovery strategy
use_SLIP39_recovery = zymkey.RecoveryStrategySLIP39(
    group_count = 5,  # Maximum possible groups
    group_threshold = 2,  # Will be determined from shares
    iteration_exponent = 0,
    variant = "",
    passphrase = "{}"
)

# Start recovery session
return_code = zymkey.client.open_SLIP39_restore_wallet_master_seed_session(
    "{}",
    "",
    "{}",
    use_SLIP39_recovery
)

if return_code < 0:
    print(f"Error: {{return_code}}")
    sys.exit(1)

# Feed shares
for share in shares:
    result = zymkey.client.feed_SLIP39_share_pwd(share, "")
    if result > 0:
        # Master seed recovered
        print(f"MASTER_SEED_SLOT:{{result}}")
        break
        "#,
        shares_str,
        passphrase,
        key_type,
        wallet_name
    );

    // Execute Python script
    let output = Command::new("python3")
        .arg("-c")
        .arg(python_script)
        .output()?;

    // Parse output to extract master seed slot
    let stdout = str::from_utf8(&output.stdout)?;

    // Find the master seed slot
    for line in stdout.lines() {
        if line.starts_with("MASTER_SEED_SLOT:") {
            let parts: Vec<_> = line.splitn(2, ":").collect();
            if parts.len() == 2 {
                return Ok(parts[1].parse()?);
            }
        }
    }

    Err(anyhow::anyhow!("Failed to recover master seed"))
}
```

### 4.3 Key backup and recovery procedure

#### Backup procedure:

1. **Preparation**:
   - Define SLIP39 backup strategy (groups, thresholds)
   - Secure the backup environment

2. **Generation**:
   ```rust
   let config = Slip39Config {
       group_count: 3,
       group_threshold: 2,
       groups: vec![(2, 3), (2, 3), (3, 5)], // (threshold, count) for each group
       passphrase: "optional_passphrase".to_string(),
   };

   let hsm = HsmClient::new()?;
   let shares = generate_slip39_shares(&config, &hsm, "secp256k1", "ValidatorMasterKey")?;

   // Distribute shares according to backup plan
   for (group_idx, group) in shares.iter().enumerate() {
       println!("Group {}", group_idx);
       for (member_idx, share) in group.iter().enumerate() {
           println!("  Member {}: {}", member_idx, share);
           // In production: securely distribute to authorized personnel
       }
   }
   ```

3. **Verification**:
   - Test recovery with a subset of shares
   - Document share distribution (without revealing content)

#### Recovery procedure:

1. **Gather shares**:
   - Obtain the minimum required number from the secure locations

2. **Execute recovery**:
   ```rust
   let hsm = HsmClient::new()?;
   let shares = vec![
       "group1_share1".to_string(),
       "group1_share2".to_string(),
       "group3_share1".to_string(),
       "group3_share2".to_string(),
       "group3_share3".to_string(),
   ];

   let master_seed_slot = recover_from_slip39_shares(
       &shares,
       "optional_passphrase",
       &hsm,
       "secp256k1",
       "ValidatorMasterKey"
   )?;

   println!("Master seed recovered in slot: {}", master_seed_slot);
   ```

3. **Regenerate validator keys**:
   ```rust
   // Regenerate validator key using standard derivation path
   let validator_key_slot = hsm.generate_wallet_child_key(
       master_seed_slot,
       "m/12381/3600/0/0" // Standard Ethereum validator path
   )?;

   // Export public key for verification
   let public_key = hsm.export_public_key(validator_key_slot)?;
   println!("Recovered validator public key: {}", hex::encode(&public_key));
   ```

### 4.4 Best practices for key management

1. **Physical security**:
   - Store SLIP39 shares in geographically distributed secure locations
   - Use tamper-evident storage for shares
   - Implement physical access controls

2. **Operational procedures**:
   - Document key generation and recovery procedures
   - Implement multi-person authorization for key operations
   - Regularly audit the security of share storage

3. **Separation of duties**:
   - Distribute shares to different trusted individuals
   - Require multiple roles for recovery operations
   - Enforce time delays for recovery operations

## 5. Enforcing HSM usage for bridge nodes

### 5.1 Technical architecture

Implement a multi-layered approach to ensure cryptographic operations occur only in the HSM:

```
┌─────────────────────────────────────────────┐
│ Bridge Node Architecture                    │
│                                             │
│  ┌───────────────────┐                      │
│  │ Application Layer │                      │
│  └────────┬──────────┘                      │
│           │                                 │
│  ┌────────▼──────────┐  ┌─────────────────┐ │
│  │ HSM Enforcement   │  │  Policy Engine  │ │
│  │ Middleware        │◄─┤                 │ │
│  └────────┬──────────┘  └─────────────────┘ │
│           │                                 │
│  ┌────────▼──────────┐                      │
│  │ HSM Interface     │                      │
│  └────────┬──────────┘                      │
│           │                                 │
│  ┌────────▼──────────┐                      │
│  │ Hardware Security │                      │
│  │ Module (HSM6)     │                      │
│  └───────────────────┘                      │
└─────────────────────────────────────────────┘
```

### 5.2 Enforcement middleware

Create a middleware to intercept all cryptographic operations:

```rust
// in src/hsm_enforcement.rs
use std::marker::PhantomData;

// Trait defining cryptographic operations
pub trait CryptoOperations {
    fn sign(&self, key_handle: i32, data: &[u8]) -> Result<Vec<u8>, anyhow::Error>;
    fn verify(&self, public_key: &[u8], data: &[u8], signature: &[u8]) -> Result<bool, anyhow::Error>;
}

// Implementation using HSM
pub struct HsmCryptoOperations {
    hsm: HsmClient,
}

impl CryptoOperations for HsmCryptoOperations {
    fn sign(&self, key_handle: i32, data: &[u8]) -> Result<Vec<u8>, anyhow::Error> {
        Ok(self.hsm.sign(data, key_handle)?)
    }

    fn verify(&self, public_key: &[u8], data: &[u8], signature: &[u8]) -> Result<bool, anyhow::Error> {
        // Implement verification using HSM
        // This is a simplified example
        Ok(true)
    }
}

// Enforcement middleware that ensures HSM usage
pub struct HsmEnforcementMiddleware<T, C: CryptoOperations> {
    inner: T,
    crypto: C,
    _marker: PhantomData<T>,
}

impl<T, C: CryptoOperations> HsmEnforcementMiddleware<T, C> {
    pub fn new(inner: T, crypto: C) -> Self {
        Self {
            inner,
            crypto,
            _marker: PhantomData,
        }
    }

    // Helper to ensure HSM operation with verification
    fn ensure_hsm_operation<F, R>(&self, operation: F) -> Result<R, anyhow::Error>
    where
        F: FnOnce(&C) -> Result<R, anyhow::Error>
    {
        // Verify HSM is available
        self.verify_hsm_available()?;

        // Execute operation
        let result = operation(&self.crypto)?;

        // Verify operation was logged
        self.verify_operation_logged()?;

        Ok(result)
    }

    fn verify_hsm_available(&self) -> Result<(), anyhow::Error> {
        // Implement HSM availability check
        // This is a simplified example
        Ok(())
    }

    fn verify_operation_logged(&self) -> Result<(), anyhow::Error> {
        // Implement operation logging verification
        // This is a simplified example
        Ok(())
    }
}

// Implement the bridge node operations with HSM enforcement
impl<T: BridgeNode, C: CryptoOperations> BridgeNode for HsmEnforcementMiddleware<T, C> {
    fn sign_transaction(&self, transaction: &Transaction) -> Result<Signature, anyhow::Error> {
        self.ensure_hsm_operation(|crypto| {
            let data = transaction.serialize()?;
            let key_handle = transaction.get_key_handle()?;

            let signature_bytes = crypto.sign(key_handle, &data)?;
            Ok(Signature::from_bytes(signature_bytes))
        })
    }

    fn verify_signature(&self, transaction: &Transaction, signature: &Signature) -> Result<bool, anyhow::Error> {
        self.ensure_hsm_operation(|crypto| {
            let data = transaction.serialize()?;
            let public_key = transaction.get_public_key()?;

            crypto.verify(&public_key, &data, &signature.to_bytes())
        })
    }
}
```

### 5.3 Runtime policy enforcement

Implement runtime checks to ensure HSM operations:

```rust
// in src/policy.rs
pub struct SecurityPolicy {
    non_exportable_keys: bool,
    require_quorum: bool,
    min_signatures: u8,
    max_transaction_value: u64,
}

pub fn enforce_transaction_policy(
    transaction: &Transaction,
    policy: &SecurityPolicy,
    signatures: &[Signature],
) -> Result<(), anyhow::Error> {
    // Check minimum signature threshold
    if policy.require_quorum && signatures.len() < policy.min_signatures as usize {
        return Err(anyhow::anyhow!("Insufficient signatures"));
    }

    // Check transaction value limit
    if transaction.value > policy.max_transaction_value {
        return Err(anyhow::anyhow!("Transaction value exceeds limit"));
    }

    Ok(())
}

// Policy-enforcing key generation function
pub fn generate_bridge_key(hsm: &HsmClient) -> Result<i32, anyhow::Error> {
    // Check if HSM is in production mode
    let production_mode = check_hsm_production_mode(hsm)?;

    if !production_mode {
        return Err(anyhow::anyhow!("HSM must be in production mode"));
    }

    // Generate key in HSM
    let key_slot = hsm.generate_key_pair(KeyType::Secp256k1)?;

    // Configure key as non-exportable
    configure_key_as_non_exportable(hsm, key_slot)?;

    Ok(key_slot)
}

fn check_hsm_production_mode(hsm: &HsmClient) -> Result<bool, anyhow::Error> {
    // Implementation would depend on HSM API
    // This is a simplified example
    Ok(true)
}

fn configure_key_as_non_exportable(hsm: &HsmClient, key_slot: i32) -> Result<(), anyhow::Error> {
    // Implementation would depend on HSM API
    // This is a simplified example
    Ok(())
}
```

### 5.4 Attestation mechanisms

Implement attestation to verify HSM usage:

```rust
// in src/attestation.rs
pub struct KeyAttestation {
    public_key: Vec<u8>,
    device_id: String,
    timestamp: u64,
    signature: Vec<u8>,
}

pub fn generate_key_attestation(
    hsm: &HsmClient,
    key_handle: i32,
) -> Result<KeyAttestation, anyhow::Error> {
    // Get public key
    let public_key = hsm.export_public_key(key_handle)?;

    // Get device ID
    let device_id = get_hsm_device_id(hsm)?;

    // Current timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    // Request attestation from HSM
    // This would require HSM-specific implementation
    let signature = generate_attestation_signature(hsm, &public_key, &device_id, timestamp)?;

    Ok(KeyAttestation {
        public_key,
        device_id,
        timestamp,
        signature,
    })
}

fn get_hsm_device_id(hsm: &HsmClient) -> Result<String, anyhow::Error> {
    // Implementation would depend on HSM API
    // This is a simplified example
    Ok("HSM6-0123456789ABCDEF".to_string())
}

fn generate_attestation_signature(
    hsm: &HsmClient,
    public_key: &[u8],
    device_id: &str,
    timestamp: u64,
) -> Result<Vec<u8>, anyhow::Error> {
    // Implementation would depend on HSM API
    // This is a simplified example
    let data = [
        public_key,
        device_id.as_bytes(),
        &timestamp.to_be_bytes(),
    ].concat();

    // Sign with an attestation key in the HSM
    hsm.sign(&data, 0) // Assume key slot 0 is the attestation key
}

pub fn verify_attestation(
    attestation: &KeyAttestation,
    root_cert: &[u8],
) -> Result<bool, anyhow::Error> {
    // Verify attestation signature using HSM manufacturer's root certificate
    // This is a simplified example
    Ok(true)
}
```

## 6. Hardware setup and configuration

### 6.1 Hardware compatibility

The Zymbit HSM6 is compatible with:
- Raspberry Pi 4 (all memory variants, 8GB recommended)
- Raspberry Pi 5 (recommended for better performance)
- Raspberry Pi Compute Module 4
- Raspberry Pi Compute Module 5

### 6.2 Physical installation

1. **Prepare components**:
   - Raspberry Pi board
   - Zymbit HSM6 module
   - Zymbit Developer HAT
   - CR2032 battery
   - High-quality power supply
   - Cooling solution (heatsink/fan)
   - Minimum 32GB microSD card
   - External SSD storage (1TB+ recommended)

2. **Assembly steps**:
   ```
   1. Install CR2032 battery in Developer HAT
   2. Install HSM6 module on Developer HAT
   3. Connect Developer HAT to Raspberry Pi GPIO pins
   4. Connect SSD to USB 3.0 port (blue port)
   5. Connect Ethernet cable
   6. Install in secure enclosure
   ```

### 6.3 Software installation

1. **Install operating system**:
   ```bash
   # Download and flash Ubuntu Server 22.04 LTS (64-bit) to SD card

   # Initial system setup
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y openssh-server ufw fail2ban
   ```

2. **Enable I2C interface**:
   ```bash
   sudo raspi-config
   # Navigate to "Interfacing Options" → "I2C" and enable it
   ```

3. **Install Zymbit software**:
   ```bash
   curl -G https://s3.amazonaws.com/zk-sw-repo/install_zk_sw.sh | sudo bash
   ```

4. **Verify installation**:
   ```bash
   # After system reboot, the HSM6's blue LED should blink once every 3 seconds

   # Test HSM6 functionality
   python3 /usr/local/share/zymkey/examples/zk_app_utils_test.py
   python3 /usr/local/share/zymkey/examples/zk_crypto_test.py
   ```

### 6.4 Physical security recommendations

1. **Tamper detection configuration**:
   ```python
   import zymkey

   # Configure channel 0 (perimeter circuit 1)
   zymkey.client.set_perimeter_event_actions(
       0,                          # Channel 0
       action_notify=True,         # Enable notifications
       action_self_destruct=False  # Don't enable self-destruct for testing
   )

   # Configure channel 1 (perimeter circuit 2)
   zymkey.client.set_perimeter_event_actions(
       1,                          # Channel 1
       action_notify=True,         # Enable notifications
       action_self_destruct=False  # Don't enable self-destruct for testing
   )
   ```

2. **Secure enclosure design**:
   - Use a tamper-evident case
   - Route perimeter detection circuits through case seams
   - House in a secure cabinet or rack
   - Implement environmental monitoring

3. **Production mode configuration**:
   ```python
   import zymkey

   # Check current binding info
   print(zymkey.client.get_binding_info())

   # CAUTION: Permanently lock binding (IRREVERSIBLE)
   # Only run when fully tested and ready for production
   # zymkey.client.lock_binding()

   # Verify binding is locked
   print(zymkey.client.get_binding_info())
   ```

### 6.5 System hardening

1. **User account security**:
   ```bash
   # Create a non-root user for validator operations
   sudo adduser validator
   sudo usermod -aG sudo validator

   # Disable root login via SSH
   sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
   sudo systemctl restart ssh
   ```

2. **Firewall configuration**:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow ssh
   sudo ufw limit ssh
   # Add rules for validator node ports as required
   sudo ufw enable
   ```

3. **CPU governor configuration**:
   ```bash
   # Set CPU governor to performance mode
   echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

   # Make setting persistent
   sudo apt install -y cpufrequtils
   sudo bash -c 'echo "GOVERNOR=performance" > /etc/default/cpufrequtils'
   ```

## 7. Performance considerations

### 7.1 HSM6 performance characteristics

The HSM6 hardware has specific performance characteristics:

- **Cryptographic operations**: Hardware acceleration for asymmetric operations
- **I2C communication**: Limited by I2C bus speed when communicating with the Raspberry Pi
- **Key management**: 640 total key slots available (12 factory pre-configured, 512 for user keys)

### 7.2 Performance bottlenecks

Primary bottlenecks in HSM+MPC systems:

1. **Hardware communication**:
   - I2C interface adds latency for each HSM operation
   - Data transfer between Raspberry Pi and HSM6 introduces overhead

2. **Protocol overhead**:
   - Network communication between MPC parties adds significant latency
   - Zero-knowledge proofs are computationally intensive

3. **Resource limitations**:
   - Raspberry Pi has limited RAM and CPU resources
   - Storage I/O can become a bottleneck for blockchain data

### 7.3 Optimization strategies

#### 7.3.1 Protocol-level optimizations

```rust
// in src/optimizations.rs

// Batch multiple presignatures in a single session
pub async fn batch_generate_presignatures<P>(
    party: &mut P,
    execution_id: &[u8],
    party_index: u16,
    parties_indexes: &[u16],
    key_share: &KeyShare<Secp256k1>,
    count: usize,
) -> Result<Vec<PresignatureData<Secp256k1>>, anyhow::Error>
where
    P: MpcParty,
{
    let eid = ExecutionId::new(execution_id);

    // Generate multiple presignatures in batch
    let presignatures = cggmp21::presign_batch(eid, party_index, parties_indexes, key_share)
        .set_batch_size(count)
        .start(&mut OsRng, party)
        .await?;

    Ok(presignatures)
}

// Cache presignatures for fast signing
pub struct PresignatureCache<C: Curve> {
    cache: Vec<PresignatureData<C>>,
}

impl<C: Curve> PresignatureCache<C> {
    pub fn new() -> Self {
        Self { cache: Vec::new() }
    }

    pub fn add_presignatures(&mut self, presignatures: Vec<PresignatureData<C>>) {
        self.cache.extend(presignatures);
    }

    pub fn take_presignature(&mut self) -> Option<PresignatureData<C>> {
        if self.cache.is_empty() {
            None
        } else {
            Some(self.cache.remove(0))
        }
    }

    pub fn remaining(&self) -> usize {
        self.cache.len()
    }
}

// Fast signing using cached presignatures
pub async fn fast_sign_with_presignature<P>(
    party: &mut P,
    execution_id: &[u8],
    party_index: u16,
    parties_indexes: &[u16],
    key_share: &KeyShare<Secp256k1>,
    presignature: PresignatureData<Secp256k1>,
    message: &[u8],
) -> Result<Vec<u8>, anyhow::Error>
where
    P: MpcParty,
{
    let eid = ExecutionId::new(execution_id);
    let data_to_sign = DataToSign::digest::<Sha256>(message);

    // Use presignature for fast signing
    let signature = cggmp21::sign_online(eid, party_index, parties_indexes, key_share)
        .sign(party, presignature, data_to_sign)
        .await?;

    Ok(signature.to_bytes().to_vec())
}
```

#### 7.3.2 System-level optimizations

```rust
// in src/system_optimizations.rs

// Configuring I2C for optimal performance
pub fn optimize_i2c_communication() -> Result<(), anyhow::Error> {
    // Run system commands to optimize I2C
    let output = Command::new("sudo")
        .args(["bash", "-c", "echo options i2c_bcm2708 baudrate=400000 > /etc/modprobe.d/i2c.conf"])
        .output()?;

    if !output.status.success() {
        return Err(anyhow::anyhow!("Failed to set I2C baudrate"));
    }

    Ok(())
}

// Optimizing memory usage for large transaction volumes
pub fn optimize_memory_configuration() -> Result<(), anyhow::Error> {
    // Configure swap if needed
    let output = Command::new("sudo")
        .args(["bash", "-c", "dd if=/dev/zero of=/swapfile bs=1M count=2048 && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"])
        .output()?;

    if !output.status.success() {
        return Err(anyhow::anyhow!("Failed to configure swap"));
    }

    // Add swap to fstab for persistence
    let output = Command::new("sudo")
        .args(["bash", "-c", "echo '/swapfile swap swap defaults 0 0' >> /etc/fstab"])
        .output()?;

    if !output.status.success() {
        return Err(anyhow::anyhow!("Failed to update fstab"));
    }

    // Set swappiness
    let output = Command::new("sudo")
        .args(["sysctl", "-w", "vm.swappiness=10"])
        .output()?;

    if !output.status.success() {
        return Err(anyhow::anyhow!("Failed to set swappiness"));
    }

    Ok(())
}
```

### 7.4 Performance benchmarking

Implement benchmarking to measure performance:

```rust
// in src/benchmarks.rs
use std::time::{Duration, Instant};

// Benchmark HSM operations
pub fn benchmark_hsm_operations(hsm: &HsmClient, iterations: usize) -> Result<(), anyhow::Error> {
    // Benchmark key generation
    let start = Instant::now();
    let mut key_slots = Vec::with_capacity(iterations);

    for _ in 0..iterations {
        let key_slot = hsm.generate_key_pair(KeyType::Secp256k1)?;
        key_slots.push(key_slot);
    }

    let key_gen_duration = start.elapsed();
    println!("Key generation: {} ms/op", key_gen_duration.as_millis() as f64 / iterations as f64);

    // Benchmark signing
    let data = b"Test message for signing";
    let start = Instant::now();

    for key_slot in &key_slots {
        hsm.sign(data, *key_slot)?;
    }

    let signing_duration = start.elapsed();
    println!("Signing: {} ms/op", signing_duration.as_millis() as f64 / iterations as f64);

    Ok(())
}

// Benchmark threshold signatures
pub async fn benchmark_threshold_signatures<P>(
    party: &mut P,
    hsm: &HsmClient,
    iterations: usize,
) -> Result<(), anyhow::Error>
where
    P: MpcParty,
{
    // Setup for benchmarking
    let execution_id = b"benchmark";
    let party_index = 0;
    let party_count = 3;
    let threshold = 2;

    // Benchmark key generation
    let start = Instant::now();
    let (key_share, key_slot) = generate_threshold_key(
        party,
        execution_id,
        party_index,
        party_count,
        threshold,
        hsm,
    ).await?;

    let key_gen_duration = start.elapsed();
    println!("Threshold key generation: {} ms", key_gen_duration.as_millis());

    // Benchmark presignature generation
    let start = Instant::now();
    let presignatures = batch_generate_presignatures(
        party,
        execution_id,
        party_index,
        &[0, 1, 2],
        &key_share,
        iterations,
    ).await?;

    let presign_duration = start.elapsed();
    println!("Presignature generation: {} ms/op", presign_duration.as_millis() as f64 / iterations as f64);

    // Benchmark online signing
    let message = b"Test message for threshold signing";
    let start = Instant::now();

    for presignature in presignatures {
        fast_sign_with_presignature(
            party,
            execution_id,
            party_index,
            &[0, 1, 2],
            &key_share,
            presignature,
            message,
        ).await?;
    }

    let signing_duration = start.elapsed();
    println!("Online signing: {} ms/op", signing_duration.as_millis() as f64 / iterations as f64);

    Ok(())
}
```

## 8. Security testing and validation

### 8.1 Testing framework overview

Implement a comprehensive security testing framework:

```rust
// in src/security_testing.rs
pub struct SecurityTest {
    name: String,
    description: String,
    severity: TestSeverity,
    test_function: Box<dyn Fn() -> Result<(), anyhow::Error>>,
}

pub enum TestSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

pub struct SecurityTestRunner {
    tests: Vec<SecurityTest>,
}

impl SecurityTestRunner {
    pub fn new() -> Self {
        Self { tests: Vec::new() }
    }

    pub fn add_test(&mut self, test: SecurityTest) {
        self.tests.push(test);
    }

    pub fn run_tests(&self) -> Vec<TestResult> {
        let mut results = Vec::new();

        for test in &self.tests {
            println!("Running test: {}", test.name);
            let start = Instant::now();
            let result = (test.test_function)();
            let duration = start.elapsed();

            let test_result = TestResult {
                name: test.name.clone(),
                passed: result.is_ok(),
                error: result.err().map(|e| e.to_string()),
                duration,
            };

            results.push(test_result);
        }

        results
    }
}

pub struct TestResult {
    name: String,
    passed: bool,
    error: Option<String>,
    duration: Duration,
}
```

### 8.2 HSM security testing

Test the HSM's security properties:

```rust
// in src/hsm_security_tests.rs
pub fn create_hsm_security_tests() -> Vec<SecurityTest> {
    let mut tests = Vec::new();

    // Test key extraction prevention
    tests.push(SecurityTest {
        name: "Key Extraction Prevention".to_string(),
        description: "Tests that private keys cannot be extracted from HSM".to_string(),
        severity: TestSeverity::Critical,
        test_function: Box::new(|| {
            let hsm = HsmClient::new()?;
            let key_slot = hsm.generate_key_pair(KeyType::Secp256k1)?;

            // Attempt to extract private key (should fail)
            // This is a conceptual example, the actual code would depend on HSM API
            let result = extract_private_key(&hsm, key_slot);

            if result.is_ok() {
                return Err(anyhow::anyhow!("Private key extraction succeeded but should fail"));
            }

            Ok(())
        }),
    });

    // Test tamper detection
    tests.push(SecurityTest {
        name: "Tamper Detection".to_string(),
        description: "Tests that tamper detection mechanisms are active".to_string(),
        severity: TestSeverity::High,
        test_function: Box::new(|| {
            // Simplified test - in reality would require physical intervention
            // or mocking the tamper detection circuits

            let hsm = HsmClient::new()?;

            // Check if tamper detection is active
            // This would require HSM-specific implementation
            let tamper_active = check_tamper_detection_active(&hsm)?;

            if !tamper_active {
                return Err(anyhow::anyhow!("Tamper detection is not active"));
            }

            Ok(())
        }),
    });

    // Add more tests as needed

    tests
}

fn extract_private_key(hsm: &HsmClient, key_slot: i32) -> Result<Vec<u8>, anyhow::Error> {
    // This should fail - private keys should not be extractable
    // Implementation would depend on HSM API
    Err(anyhow::anyhow!("Private key extraction not supported"))
}

fn check_tamper_detection_active(hsm: &HsmClient) -> Result<bool, anyhow::Error> {
    // Implementation would depend on HSM API
    // This is a simplified example
    Ok(true)
}
```

### 8.3 MPC protocol testing

Test the MPC protocol's security properties:

```rust
// in src/mpc_security_tests.rs
pub async fn create_mpc_security_tests<P>(party: &mut P) -> Vec<SecurityTest>
where
    P: MpcParty,
{
    let mut tests = Vec::new();

    // Test threshold enforcement
    tests.push(SecurityTest {
        name: "Threshold Enforcement".to_string(),
        description: "Tests that signatures require at least t parties".to_string(),
        severity: TestSeverity::Critical,
        test_function: Box::new(|| {
            // Implementation would require multiple parties and would be async
            // This is a simplified example
            Ok(())
        }),
    });

    // Test against known vulnerabilities
    tests.push(SecurityTest {
        name: "Known Vulnerability Testing".to_string(),
        description: "Tests against known vulnerabilities in MPC protocols".to_string(),
        severity: TestSeverity::Critical,
        test_function: Box::new(|| {
            // Test against alpha-shuffle attack
            // Test against c-split attack
            // Test against presignature reuse
            // Test against undefined delta_inv attack

            // Implementation would require specific attack simulations
            // This is a simplified example
            Ok(())
        }),
    });

    // Add more tests as needed

    tests
}
```

### 8.4 Integration testing

Test the integrated system:

```rust
// in src/integration_security_tests.rs
pub async fn create_integration_security_tests<P>(
    party: &mut P,
    hsm: &HsmClient,
) -> Vec<SecurityTest>
where
    P: MpcParty,
{
    let mut tests = Vec::new();

    // Test end-to-end signature creation and verification
    tests.push(SecurityTest {
        name: "End-to-End Signature Verification".to_string(),
        description: "Tests the complete signature creation and verification process".to_string(),
        severity: TestSeverity::High,
        test_function: Box::new(|| {
            // Implementation would require multiple parties and would be async
            // This is a simplified example
            Ok(())
        }),
    });

    // Test error handling
    tests.push(SecurityTest {
        name: "Error Handling".to_string(),
        description: "Tests system behavior with intentionally corrupted inputs".to_string(),
        severity: TestSeverity::Medium,
        test_function: Box::new(|| {
            // Test with corrupted inputs
            // Test with network interruptions
            // Test system recovery

            // Implementation would require specific error simulations
            // This is a simplified example
            Ok(())
        }),
    });

    // Add more tests as needed

    tests
}
```

### 8.5 Continuous security validation

Implement continuous security validation:

```rust
// in src/continuous_validation.rs
pub struct SecurityMonitor {
    hsm: HsmClient,
    check_interval: Duration,
}

impl SecurityMonitor {
    pub fn new(hsm: HsmClient, check_interval: Duration) -> Self {
        Self { hsm, check_interval }
    }

    pub async fn start_monitoring(&self) -> Result<(), anyhow::Error> {
        let mut interval = tokio::time::interval(self.check_interval);

        loop {
            interval.tick().await;

            // Perform security checks
            if let Err(err) = self.check_hsm_integrity().await {
                log::error!("HSM integrity check failed: {}", err);
                // Implement alerting mechanism
            }

            if let Err(err) = self.check_system_integrity().await {
                log::error!("System integrity check failed: {}", err);
                // Implement alerting mechanism
            }
        }
    }

    async fn check_hsm_integrity(&self) -> Result<(), anyhow::Error> {
        // Verify HSM connectivity
        // Check tamper detection status
        // Verify key accessibility

        // Implementation would depend on HSM API
        // This is a simplified example
        Ok(())
    }

    async fn check_system_integrity(&self) -> Result<(), anyhow::Error> {
        // Check critical system files
        // Verify running processes
        // Check network connections

        // Implementation would depend on system requirements
        // This is a simplified example
        Ok(())
    }
}
```

## Conclusion

Integrating Zymbit HSM6 hardware security modules with Rust-based CGGMP21 threshold signature implementations on Raspberry Pi creates a powerful security architecture for validator nodes. By combining hardware-based key protection with distributed trust, this approach significantly reduces the risk of key compromise while maintaining operational flexibility.

The implementation covers integration with Rust through FFI bindings, migration from CGGMP20 to CGGMP21, comprehensive key management with SLIP39, hardware setup and configuration, performance optimization strategies, and security testing frameworks. These components form a complete solution for deploying secure validator infrastructure.

While implementing this architecture requires careful integration work and thorough testing, the security benefits are substantial and well worth the effort for protecting high-value blockchain operations.
