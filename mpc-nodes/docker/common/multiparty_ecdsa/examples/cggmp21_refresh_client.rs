#![allow(non_snake_case)]

use curv::elliptic::curves::{secp256_k1::Secp256k1, Point, Scalar};
use multi_party_ecdsa::protocols::multi_party_ecdsa::gg_2021::party_i::RefreshParty;
use multi_party_ecdsa::protocols::multi_party_ecdsa::gg_2021::state_machine::traits::KeyShare;
use std::{env, fs};
use reqwest::Client;
use serde_json::json;

mod common;
use common::{Params, PartySignup, broadcast, poll_for_broadcasts, postb, sendp2p};

fn main() {
    // Parse command-line arguments
    if env::args().nth(4).is_none() {
        panic!("Usage: {} <party_index> <threshold> <n_parties> <epoch_id>", env::args().nth(0).unwrap());
    }
    
    let party_index = env::args().nth(1).unwrap().parse::<usize>().unwrap();
    let threshold = env::args().nth(2).unwrap().parse::<usize>().unwrap();
    let n_parties = env::args().nth(3).unwrap().parse::<usize>().unwrap();
    let epoch_id = env::args().nth(4).unwrap().parse::<u64>().unwrap();
    
    // Read key share from stdin
    let mut input = String::new();
    std::io::Read::read_to_string(&mut std::io::stdin(), &mut input).expect("Failed to read from stdin");
    let key_share: KeyShare = serde_json::from_str(&input).expect("Failed to parse key share");
    
    // Create a client for API communication
    let client = Client::new();
    
    // Initialize refresh party
    let mut refresh = RefreshParty::new(party_index, threshold, epoch_id, key_share);
    
    // Read parameters
    let data = fs::read_to_string("params.json")
        .expect("Unable to read params, make sure config file is present in the same folder");
    let params: Params = serde_json::from_str(&data).unwrap();
    
    // Sign up for the protocol
    let (party_num_int, uuid) = match signup(&client).unwrap() {
        PartySignup { number, uuid } => (number, uuid),
    };
    println!("Party {} (index {}) joined key refresh with UUID: {}", party_num_int, party_index, uuid);
    
    // Execute key refresh protocol
    
    // Round 1: Generate and broadcast first message
    let round1_msg = refresh.round1().expect("Failed to generate round 1 message");
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
    let round2_msg = refresh.round2(round1_msgs_parsed).expect("Failed to generate round 2 message");
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
    let round3_msg = refresh.round3(round2_msgs_parsed).expect("Failed to generate round 3 message");
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
    
    // Finalize: Process round 3 messages and generate refreshed key share
    let new_key_share = refresh.finalize(round3_msgs_parsed).expect("Failed to finalize key refresh");
    
    // Output the refreshed key share to stdout
    let key_share_json = serde_json::to_string(&new_key_share).unwrap();
    println!("{}", key_share_json);
    
    // Also save to file for convenience
    let filename = format!("key_share_{}_{}.json", party_index, epoch_id);
    fs::write(&filename, &key_share_json).expect("Unable to save refreshed key share");
    
    println!("Key refresh completed successfully!");
    println!("Refreshed key share saved to {}", filename);
}

// Sign up for the protocol
fn signup(client: &Client) -> Result<PartySignup, ()> {
    let key = "signup-refresh".to_string();
    
    let res_body = postb(client, "signuprefresh", key).unwrap();
    serde_json::from_str(&res_body).unwrap()
}