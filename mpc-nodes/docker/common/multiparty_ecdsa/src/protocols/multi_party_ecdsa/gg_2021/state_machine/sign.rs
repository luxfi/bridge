/*
    Signing state machine for CGGMP21 protocol
*/

use crate::protocols::multi_party_ecdsa::gg_2021::state_machine::traits::{ECDSASignature, PresignData, ProtocolMessage, SignStateMachine, SignatureShare, StateMachine};
use serde::{Deserialize, Serialize};
use std::fmt::Debug;

/// Signing rounds enum
#[derive(Clone, Debug)]
pub enum SignRound {
    /// Initial round
    Round0,
    /// Generate signature share
    Sign,
    /// Signing completed
    Finished,
}

/// Signing messages
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SignMessage {
    /// Signature share
    SignatureShare(SignatureShare),
}

impl ProtocolMessage for SignMessage {}

/// Signing state machine
pub struct SignStateMachineImpl {
    /// Current round
    round: SignRound,
    /// Party index
    party_index: usize,
    /// Message digest
    message_digest: [u8; 32],
    /// Presign data
    presign_data: PresignData,
    /// Signature shares received
    signature_shares: Vec<SignatureShare>,
    /// Output signature
    output: Option<ECDSASignature>,
    /// Own signature share
    own_share: Option<SignatureShare>,
    // Additional state would be added here
}

impl SignStateMachineImpl {
    /// Create a new signing state machine
    pub fn new(party_index: usize, message_digest: [u8; 32], presign_data: PresignData) -> Self {
        Self {
            round: SignRound::Round0,
            party_index,
            message_digest,
            presign_data,
            signature_shares: Vec::new(),
            output: None,
            own_share: None,
        }
    }
}

impl StateMachine for SignStateMachineImpl {
    type Output = ECDSASignature;
    type MessageType = SignMessage;
    
    fn process_incoming(&mut self, msg: Self::MessageType) -> Result<(), String> {
        match msg {
            SignMessage::SignatureShare(share) => {
                // Add the signature share to the collection
                self.signature_shares.push(share);
                
                // Check if we have enough shares to combine
                if self.signature_shares.len() == self.presign_data.threshold {
                    // Combine the signature shares
                    let mut all_shares = self.signature_shares.clone();
                    if let Some(own_share) = &self.own_share {
                        all_shares.push(own_share.clone());
                    }
                    
                    // Implement the actual combining logic here
                    // ...
                    
                    // Set the output
                    self.output = Some(ECDSASignature {
                        r: Default::default(), // Replace with actual values
                        s: Default::default(), // Replace with actual values
                        recid: None,
                    });
                    
                    // Update the state
                    self.round = SignRound::Finished;
                }
                
                Ok(())
            }
        }
    }
    
    fn process_timeout(&mut self) -> Result<(), String> {
        // Not applicable for non-interactive signing
        Ok(())
    }
    
    fn is_finished(&self) -> bool {
        match self.round {
            SignRound::Finished => true,
            _ => false,
        }
    }
    
    fn get_output(&self) -> Option<Self::Output> {
        self.output.clone()
    }
    
    fn get_next_message(&mut self) -> Option<Self::MessageType> {
        match self.round {
            SignRound::Round0 => {
                // Generate the signature share
                // This would be implemented based on the presign data and message digest
                // ...
                
                // For now, we'll just create a placeholder
                let share = SignatureShare {
                    party_id: self.party_index,
                    session_id: self.presign_data.session_id.clone(),
                    s_share: Default::default(), // Replace with actual computation
                    r: Default::default(),       // Replace with actual value
                };
                
                // Save our own share
                self.own_share = Some(share.clone());
                
                // Update the state
                self.round = SignRound::Sign;
                
                // Return the signature share message
                Some(SignMessage::SignatureShare(share))
            }
            _ => None,
        }
    }
}

impl SignStateMachine for SignStateMachineImpl {
    fn party_index(&self) -> usize {
        self.party_index
    }
    
    fn message_digest(&self) -> &[u8; 32] {
        &self.message_digest
    }
}