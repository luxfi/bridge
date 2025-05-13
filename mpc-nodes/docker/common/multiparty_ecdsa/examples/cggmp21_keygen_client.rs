#![allow(non_snake_case)]

use curv::elliptic::curves::{secp256_k1::Secp256k1, Point, Scalar};
use multi_party_ecdsa::protocols::multi_party_ecdsa::gg_2021::party_i::KeyGenParty;
use multi_party_ecdsa::protocols::multi_party_ecdsa::gg_2021::state_machine::traits::KeyShare;
use std::{env, fs};
use reqwest::Client;
use serde_json::json;

mod common;
use common::{Params, PartySignup, broadcast, poll_for_broadcasts, postb, sendp2p};

fn main() {
    // Parse command-line arguments
    if env::args().nth(3).is_none() {
        panic!("Usage: {} <party_index> <threshold> <n_parties>", env::args().nth(0).unwrap());
    }
    
    let party_index = env::args().nth(1).unwrap().parse::<usize>().unwrap();
    let threshold = env::args().nth(2).unwrap().parse::<usize>().unwrap();
    let n_parties = env::args().nth(3).unwrap().parse::<usize>().unwrap();
    
    // Security parameters
    let security_bits = 256; // Default security bits
    
    // Create a client for API communication
    let client = Client::new();
    
    // Initialize key generation party
    let mut keygen = KeyGenParty::new(party_index, threshold, n_parties, security_bits);
    
    // Read parameters
    let data = fs::read_to_string("params.json")
        .expect("Unable to read params, make sure config file is present in the same folder");
    let params: Params = serde_json::from_str(&data).unwrap();
    
    // Sign up for the protocol
    let (party_num_int, uuid) = match signup(&client).unwrap() {
        PartySignup { number, uuid } => (number, uuid),
    };
    println!("Party {} (index {}) joined key generation with UUID: {}", party_num_int, party_index, uuid);
    
    // Execute key generation protocol
    
    // Round 1: Generate and broadcast first message
    let round1_msg = keygen.round1().expect("Failed to generate round 1 message");
    broadcast(
        &client,
        party_num_int,
        "round1",
        serde_json::to_string(&round1_msg).unwrap(),
        uuid.clone(),
    ).expect("Failed to broadcast round 1 message");
    
    // Collect round 1 messages from other parties
    let round1_msgs = poll_for_broadcasts(
        &client,
        party_num_int,
        n_parties,
        std::time::Duration::from_millis(100),
        "round1",
        uuid.clone(),
    );
    
    // Convert string messages to proper type
    let mut round1_msgs_parsed = Vec::new();
    for msg in round1_msgs {
        round1_msgs_parsed.push(serde_json::from_str(&msg).unwrap());
    }
    
    // Round 2: Process round 1 messages and generate round 2 message
    let round2_msg = keygen.round2(round1_msgs_parsed).expect("Failed to generate round 2 message");
    broadcast(
        &client,
        party_num_int,
        "round2",
        serde_json::to_string(&round2_msg).unwrap(),
        uuid.clone(),
    ).expect("Failed to broadcast round 2 message");
    
    // Collect round 2 messages from other parties
    let round2_msgs = poll_for_broadcasts(
        &client,
        party_num_int,
        n_parties,
        std::time::Duration::from_millis(100),
        "round2",
        uuid.clone(),
    );
    
    // Convert string messages to proper type
    let mut round2_msgs_parsed = Vec::new();
    for msg in round2_msgs {
        round2_msgs_parsed.push(serde_json::from_str(&msg).unwrap());
    }
    
    // Round 3: Process round 2 messages and generate round 3 message
    let round3_msg = keygen.round3(round2_msgs_parsed).expect("Failed to generate round 3 message");
    broadcast(
        &client,
        party_num_int,
        "round3",
        serde_json::to_string(&round3_msg).unwrap(),
        uuid.clone(),
    ).expect("Failed to broadcast round 3 message");
    
    // Collect round 3 messages from other parties
    let round3_msgs = poll_for_broadcasts(
        &client,
        party_num_int,
        n_parties,
        std::time::Duration::from_millis(100),
        "round3",
        uuid.clone(),
    );
    
    // Convert string messages to proper type
    let mut round3_msgs_parsed = Vec::new();
    for msg in round3_msgs {
        round3_msgs_parsed.push(serde_json::from_str(&msg).unwrap());
    }
    
    // Finalize: Process round 3 messages and generate key share
    let key_share = keygen.finalize(round3_msgs_parsed).expect("Failed to finalize key generation");
    
    // Save key share to file
    let key_share_json = serde_json::to_string(&key_share).unwrap();
    let filename = format!("key_share_{}.json", party_index);
    fs::write(&filename, key_share_json).expect("Unable to save key share");
    
    println!("Key generation completed successfully!");
    println!("Key share saved to {}", filename);
    
    // Output key share details for verification
    println!("Public key: {}", "PLACEHOLDER"); // Replace with actual public key output
}

// Sign up for the protocol
fn signup(client: &Client) -> Result<PartySignup, ()> {
    let key = "signup-keygen".to_string();
    
    let res_body = postb(client, "signupkeygen", key).unwrap();
    serde_json::from_str(&res_body).unwrap()
}