import axios from "axios"

const MPC_URL = process.env.MPC_URL || "http://mpc-api.lux-mpc.svc:8081";
const MPC_API_KEY = process.env.MPC_API_KEY || "";
const mpc_nodes = MPC_URL.split(",").map(s => s.trim());

const mpcHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  ...(MPC_API_KEY ? { "X-API-Key": MPC_API_KEY } : {}),
};

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
        const data = await axios.post(`${mpc_node}/api/v1/generate_mpc_sig`, signData, { headers: mpcHeaders })
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
    const { data } = await axios.post(`${mpc_nodes[0]}/api/v1/complete`, { hashedTxId }, { headers: mpcHeaders })
    return data;
  } catch (err) {
    console.log(">> error in updating complete swap for mpc", err)
  }
}
