#!/bin/bash  

# Change to the specified directory  
cd dist/multiparty

# Run the keygen command
./target/release/examples/gg18_keygen_client http://sm-manager:8000 keys.store