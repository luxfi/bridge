//! Corona: Lattice-based threshold signatures for Lux Bridge
//! 
//! This library implements the Corona protocol as described in:
//! "Corona: Practical Two-Round Threshold Signatures from Learning with Errors"
//! by Boschini et al.
//!
//! Building on the foundation of the existing CGGMP/GG18 implementation,
//! this provides post-quantum secure threshold signatures.

#![warn(missing_docs)]
#![warn(clippy::all)]

pub mod ring;
pub mod gaussian;
pub mod params;
pub mod protocol;
pub mod keygen;
pub mod sign;
pub mod errors;
pub mod utils;

pub use params::{CoronaParams, SecurityLevel};
pub use protocol::{Party, PublicKey, SecretShare, Signature};
pub use errors::{CoronaError, Result};

/// Re-export commonly used types
pub mod prelude {
    pub use crate::{
        CoronaParams, SecurityLevel,
        Party, PublicKey, SecretShare, Signature,
        CoronaError, Result,
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_import() {
        let _params = CoronaParams::default();
    }
}