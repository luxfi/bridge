/*
    CGGMP21 - Threshold ECDSA Protocol Implementation
    
    Based on the paper: 
    "CGGMP21: Secure Multiparty Computation of Threshold ECDSA with Optimal Responsiveness"
    by Canetti, Gennaro, Goldfeder, Makriyannis, and Peled, 2021
    
    This implementation is based on the CGGMP21 protocol which offers:
    - Non-Interactive Signing: Only the last round requires knowledge of the message
    - Adaptive Security: Withstands adaptive corruption of signatories
    - Proactive Security: Includes periodic refresh mechanism for key shares
    - Identifiable Abort: Can identify corrupted signatories in case of failure
    - UC Security Framework: Proven security guarantees
*/

pub mod state_machine;
pub mod party_i;
pub mod accountability;

#[cfg(test)]
pub mod test;