import axios from "axios"
const MPC_URL = process.env.MPC_URL || "http://mpc-node-0:8080";
const mpc_nodes = MPC_URL.split(",").map(s => s.trim());
/**
 * get signature from mpc oracle network for mpc signature
 * @param signData 
 * @returns 
 */
export const getSigFromMpcOracleNetwork = (signData: { txId: string; fromNetworkId: string; toNetworkId: string; toTokenAddress: string; msgSignature: string; receiverAddressHash: string }) => {
  console.log("::signdata:", signData)
  return new Promise((resolve, reject) => {
    mpc_nodes.forEach(async (mpc_node: string) => {
      try {
        const data = await axios.post(`${mpc_node}/api/v1/generate_mpc_sig`, signData)
        resolve(data.data)
      } catch (err) {
        reject(err)
      }
    })
  })
}
/**
 * update mpc-node to complete swap
 * @param hashedTxId 
 * @returns 
 */
export const completeSwapWithMpc = async (hashedTxId: string) => {
  try {
    const { data } = await axios.post(`${mpc_nodes[0]}/api/v1/complete`, { hashedTxId })
    return data;
  } catch (err) {
    console.log(">> error in updating complete swap for mpc", err)
  }
}
