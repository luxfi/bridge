#![allow(non_snake_case)]

use curv::{
    arithmetic::traits::*,
    elliptic::curves::{secp256_k1::Secp256k1, Point, Scalar},
    BigInt,
};
use multi_party_ecdsa::protocols::multi_party_ecdsa::gg_2021::party_i::SignParty;
use multi_party_ecdsa::protocols::multi_party_ecdsa::gg_2021::state_machine::traits::{PresignData, SignatureShare};
use std::{env, fs};
use sha2::{Sha256, Digest};

fn main() {
    // Parse command-line arguments
    if env::args().nth(2).is_none() {
        panic!("Usage: {} <party_index> <message_hash>", env::args().nth(0).unwrap());
    }
    
    let party_index = env::args().nth(1).unwrap().parse::<usize>().unwrap();
    let message_hex = env::args().nth(2).unwrap();
    
    // Parse the message hash
    let message_bytes = if message_hex.starts_with("0x") {
        hex::decode(&message_hex[2..]).expect("Invalid hex string")
    } else {
        hex::decode(message_hex).expect("Invalid hex string")
    };
    
    // Ensure the message hash is exactly 32 bytes
    let mut message_digest = [0u8; 32];
    if message_bytes.len() == 32 {
        message_digest.copy_from_slice(&message_bytes);
    } else {
        // If not 32 bytes, hash it using SHA-256
        let mut hasher = Sha256::new();
        hasher.update(&message_bytes);
        message_digest.copy_from_slice(&hasher.finalize());
    }
    
    // Read presign data from stdin
    let mut input = String::new();
    std::io::Read::read_to_string(&mut std::io::stdin(), &mut input).expect("Failed to read from stdin");
    let presign_data: PresignData = serde_json::from_str(&input).expect("Failed to parse presign data");
    
    // Initialize sign party
    let sign_party = SignParty::new(party_index, message_digest, presign_data);
    
    // Generate signature share (non-interactive)
    let signature_share = sign_party.sign().expect("Failed to generate signature share");
    
    // Output the signature share to stdout
    let signature_share_json = serde_json::to_string(&signature_share).unwrap();
    println!("{}", signature_share_json);
    
    // Also save to file for convenience
    let message_hex_short = &message_hex[0..min(10, message_hex.len())];
    let filename = format!("sig_share_{}_{}.json", message_hex_short, party_index);
    fs::write(&filename, &signature_share_json).expect("Unable to save signature share");
    
    // Output signature share details as sig_json for compatibility with current system
    let r_hex = BigInt::from_bytes(&signature_share.r.to_bytes().as_ref()).to_str_radix(16);
    let s_hex = BigInt::from_bytes(&signature_share.s_share.to_bytes().as_ref()).to_str_radix(16);
    
    println!("sig_json: {}, {}, 0", r_hex, s_hex);
    
    println!("Signing completed successfully!");
    println!("Signature share saved to {}", filename);
}

// Helper function for min value
fn min(a: usize, b: usize) -> usize {
    if a < b { a } else { b }
}