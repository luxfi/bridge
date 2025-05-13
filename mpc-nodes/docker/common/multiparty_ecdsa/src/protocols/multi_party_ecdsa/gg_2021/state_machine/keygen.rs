/*
    Key generation state machine for CGGMP21 protocol
*/

use crate::protocols::multi_party_ecdsa::gg_2021::party_i::{Round1Message, Round2Message, Round3Message};
use crate::protocols::multi_party_ecdsa::gg_2021::state_machine::traits::{KeyGenStateMachine, KeyShare, ProtocolMessage, StateMachine};
use serde::{Deserialize, Serialize};
use std::fmt::Debug;

/// Key generation rounds enum
#[derive(Clone, Debug)]
pub enum KeyGenRound {
    /// Initial round
    Round0,
    /// Generating messages for round 1
    Round1,
    /// Processing round 1 messages
    Round2,
    /// Processing round 2 messages
    Round3,
    /// Finalizing key generation
    Finalize,
    /// Key generation completed
    Finished,
}

/// Key generation messages
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum KeyGenMessage {
    /// Round 1 message
    Round1(Round1Message),
    /// Round 2 message
    Round2(Round2Message),
    /// Round 3 message
    Round3(Round3Message),
}

impl ProtocolMessage for KeyGenMessage {}

/// Key generation state machine
pub struct KeyGenStateMachineImpl {
    /// Current round
    round: KeyGenRound,
    /// Party index
    party_index: usize,
    /// Threshold
    threshold: usize,
    /// Number of parties
    n_parties: usize,
    /// Output key share
    output: Option<KeyShare>,
    // Additional state would be added here
}

impl KeyGenStateMachineImpl {
    /// Create a new key generation state machine
    pub fn new(party_index: usize, threshold: usize, n_parties: usize) -> Self {
        Self {
            round: KeyGenRound::Round0,
            party_index,
            threshold,
            n_parties,
            output: None,
        }
    }
}

impl StateMachine for KeyGenStateMachineImpl {
    type Output = KeyShare;
    type MessageType = KeyGenMessage;
    
    fn process_incoming(&mut self, msg: Self::MessageType) -> Result<(), String> {
        // Implementation would go here
        unimplemented!("process_incoming not yet implemented")
    }
    
    fn process_timeout(&mut self) -> Result<(), String> {
        // Implementation would go here
        unimplemented!("process_timeout not yet implemented")
    }
    
    fn is_finished(&self) -> bool {
        match self.round {
            KeyGenRound::Finished => true,
            _ => false,
        }
    }
    
    fn get_output(&self) -> Option<Self::Output> {
        self.output.clone()
    }
    
    fn get_next_message(&mut self) -> Option<Self::MessageType> {
        // Implementation would go here
        unimplemented!("get_next_message not yet implemented")
    }
}

impl KeyGenStateMachine for KeyGenStateMachineImpl {
    fn party_index(&self) -> usize {
        self.party_index
    }
    
    fn threshold(&self) -> usize {
        self.threshold
    }
    
    fn n_parties(&self) -> usize {
        self.n_parties
    }
}