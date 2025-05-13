import { Protocol, createProtocol } from './mpc/protocol';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    const mpcProtocol = (process.env.mpc_protocol || 'cggmp21').toLowerCase() as Protocol;
    
    if (mpcProtocol !== Protocol.CGGMP21) {
      console.error('This script is only needed for CGGMP21 protocol');
      process.exit(1);
    }
    
    const partyId = parseInt(process.env.party_id || '0');
    const threshold = parseInt(process.env.threshold || '2');
    const totalParties = parseInt(process.env.total_parties || '3');
    const keyStore = process.env.key_store_path || './keyshares';
    const binPath = path.join(__dirname, '/multiparty/target/release/examples');
    
    // Create protocol handler
    const protocolHandler = createProtocol(mpcProtocol as Protocol, {
      partyId,
      threshold,
      totalParties,
      keySharePath: keyStore,
      binPath
    });
    
    // Check if protocol handler has generatePresignData method
    if ('generatePresignData' in protocolHandler) {
      const count = parseInt(process.env.presign_count || '10');
      console.log(`Generating ${count} presign data for party ${partyId}...`);
      
      // Generate presign data
      for (let i = 0; i < count; i++) {
        try {
          // @ts-ignore - we know this method exists
          const result = await protocolHandler.generatePresignData();
          console.log(`[${i+1}/${count}] Generated presign data: ${result.id} at ${result.path}`);
        } catch (error) {
          console.error(`Error generating presign data ${i+1}/${count}:`, error);
        }
      }
      
      console.log('Done generating presign data.');
    } else {
      console.error('Protocol does not support presigning.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
