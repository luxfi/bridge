//! Ringtail: Lattice-based threshold signatures for Lux Bridge
//! 
//! This library implements the Ringtail protocol as described in:
//! "Ringtail: Practical Two-Round Threshold Signatures from Learning with Errors"
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

pub use params::{RingtailParams, SecurityLevel};
pub use protocol::{Party, PublicKey, SecretShare, Signature};
pub use errors::{RingtailError, Result};

/// Re-export commonly used types
pub mod prelude {
    pub use crate::{
        RingtailParams, SecurityLevel,
        Party, PublicKey, SecretShare, Signature,
        RingtailError, Result,
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_import() {
        let _params = RingtailParams::default();
    }
}