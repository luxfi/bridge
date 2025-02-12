import axios from "axios"
const mpc_nodes = [
  // "http://127.0.0.1:6000",
  // "http://127.0.0.1:6000",
  // "https://teleport-0.lux.network",
  // "https://teleport-0.lux.network/"
  // 'https://teleport-2.lux.network/',
  "http://mpc-node-0:6000",
  "http://mpc-node-1:6000"
  // "http://mpc-node-2:6000"
]
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
