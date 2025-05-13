/*
    Common traits for the CGGMP21 protocol state machines
*/

use curv::elliptic::curves::{secp256_k1::Secp256k1, Point, Scalar};
use serde::{Deserialize, Serialize};
use std::fmt::Debug;

/// Represents a message in the protocol
pub trait ProtocolMessage: Serialize + Deserialize<'static> + Clone + Debug {}

/// Basic state machine execution trait
pub trait StateMachine {
    /// The output type of the state machine
    type Output;
    /// The message type used in this state machine
    type MessageType: ProtocolMessage;
    
    /// Processes a received message
    fn process_incoming(&mut self, msg: Self::MessageType) -> Result<(), String>;
    
    /// Handles timeouts in the protocol
    fn process_timeout(&mut self) -> Result<(), String>;
    
    /// Checks if the state machine execution is complete
    fn is_finished(&self) -> bool;
    
    /// Returns the output of the state machine if available
    fn get_output(&self) -> Option<Self::Output>;
    
    /// Returns the next message to be sent, if any
    fn get_next_message(&mut self) -> Option<Self::MessageType>;
}

/// Key generation state machine
pub trait KeyGenStateMachine: StateMachine {
    /// Returns the party index
    fn party_index(&self) -> usize;
    
    /// Returns the threshold
    fn threshold(&self) -> usize;
    
    /// Returns the total number of parties
    fn n_parties(&self) -> usize;
}

/// Key refresh state machine
pub trait RefreshStateMachine: StateMachine {
    /// Returns the party index
    fn party_index(&self) -> usize;
    
    /// Returns the threshold
    fn threshold(&self) -> usize;
    
    /// Returns the total number of parties
    fn n_parties(&self) -> usize;
    
    /// Returns the epoch ID
    fn epoch_id(&self) -> u64;
}

/// Presigning state machine
pub trait PresignStateMachine: StateMachine {
    /// Returns the party index
    fn party_index(&self) -> usize;
    
    /// Returns the threshold
    fn threshold(&self) -> usize;
    
    /// Returns the total number of parties
    fn n_parties(&self) -> usize;
    
    /// Returns the session ID
    fn session_id(&self) -> &str;
}

/// Signing state machine
pub trait SignStateMachine: StateMachine {
    /// Returns the party index
    fn party_index(&self) -> usize;
    
    /// Returns the message digest
    fn message_digest(&self) -> &[u8; 32];
}

/// Basic structure for ECDSA key share
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KeyShare {
    /// The party index
    pub party_id: usize,
    /// The threshold
    pub threshold: usize,
    /// The epoch ID
    pub epoch: u64,
    /// The secret share
    pub secret_share: Scalar<Secp256k1>,
    /// The public key
    pub public_key: Point<Secp256k1>,
    /// The verification shares
    pub verification_shares: Vec<Point<Secp256k1>>,
}

/// Structure for presign data
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PresignData {
    /// The session ID
    pub session_id: String,
    /// The party index
    pub party_id: usize,
    /// The threshold
    pub threshold: usize,
    /// The presign state
    pub state: Vec<u8>, // Serialized state for signing phase
}

/// Structure for ECDSA signature
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ECDSASignature {
    /// r component
    pub r: Scalar<Secp256k1>,
    /// s component
    pub s: Scalar<Secp256k1>,
    /// Recovery ID (optional)
    pub recid: Option<u8>,
}

/// Structure for signature share
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignatureShare {
    /// The party index
    pub party_id: usize,
    /// The session ID
    pub session_id: String,
    /// The s share
    pub s_share: Scalar<Secp256k1>,
    /// r component (same for all shares)
    pub r: Scalar<Secp256k1>,
}