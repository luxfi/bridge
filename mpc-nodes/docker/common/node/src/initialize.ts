import { killSigners } from "./utils"
import { Protocol } from "./mpc/protocol"
import { spawn } from "child_process"
import * as path from "path"

const main = async () => {
  // Kill any running signers
  await killSigners()

  // Check if we're using CGGMP21 protocol
  const mpcProtocol = (process.env.mpc_protocol || 'cggmp20').toLowerCase() as Protocol
  
  if (mpcProtocol === Protocol.CGGMP21) {
    console.log('Using CGGMP21 protocol - generating presign data...')
    
    try {
      // Generate presign data in the background
      const generateScript = path.join(__dirname, 'generate-presign.js')
      const child = spawn('node', [generateScript], {
        detached: true,
        stdio: 'ignore'
      })
      
      // Unref the child process to allow the parent to exit independently
      child.unref()
      
      console.log('Started background process for generating presign data')
    } catch (error) {
      console.error('Failed to start presign data generation:', error)
    }
  }
}

main().catch(console.error)
