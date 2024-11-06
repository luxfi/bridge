import axios from "axios";
import type { NextRequest, NextResponse } from "next/server";

const mpc_nodes = [
  // "http://127.0.0.1:6000",
  // "http://127.0.0.1:6000",
  "https://teleport.lux.network/node0",
  "https://teleport.lux.network/node1",
  // 'https://teleport.lux.network/node2',
];

const getSigFromMpcOracleNetwork = (signData: {
  txId: string;
  fromNetworkId: string;
  toNetworkId: string;
  toTokenAddress: string;
  msgSignature: string;
  receiverAddressHash: string;
}) => {
  console.log("::signdata:", signData);
  return new Promise((resolve, reject) => {
    mpc_nodes.forEach(async (mpc_node: string) => {
      try {
        const data = await axios.post(
          `${mpc_node}/api/v1/generate_mpc_sig`,
          signData
        );
        resolve(data.data);
      } catch (err) {
        reject(err);
      }
    });
  });
};

export async function POST(
  req: NextRequest,
) {
  try {
    const {
      txId,
      fromNetworkId,
      toNetworkId,
      toTokenAddress,
      msgSignature,
      receiverAddressHash,
    } = await req.json()

    const signData = {
      txId,
      fromNetworkId: String(fromNetworkId),
      toNetworkId: String(toNetworkId),
      toTokenAddress,
      msgSignature,
      receiverAddressHash,
      nonce: 0x0002,
    }
    const data = await getSigFromMpcOracleNetwork(signData)
    console.log("::mpc sign data", data)
      // :aa no outer 'data'
    return Response.json(
      data,
      {
        status: 200,
      }  
    )

  } 
  catch (err) {
    console.log(err);
    return new Response(null, {status: 500, statusText: "Error in generating from mpc oracle network!"})
  }
  // if (req.method === "GET") {
  //     try {
  //         const {
  //             txid,
  //             fromNetId,
  //             toNetIdHash,
  //             tokenName,
  //             tokenAddr,
  //             msgSig,
  //             toTargetAddrHash
  //         } = req.query;
  //         const cmd =
  //             `/api/v1/getsig` +
  //             `/txid/${txid}` +
  //             `/fromNetId/${fromNetId}` +
  //             `/toNetIdHash/${toNetIdHash}` +
  //             `/tokenName/${tokenName}` +
  //             `/tokenAddr/${tokenAddr}` +
  //             `/msgSig/${msgSig}` +
  //             `/toTargetAddrHash/${toTargetAddrHash}` +
  //             `/nonce/0x0002`;
  //         const data = await getSigFromMpcOracleNetwork(cmd);
  //         console.log({ cmd })
  //         res.status(200).json(data)
  //     } catch (err) {
  //         console.log(err)
  //         res.status(500).json("error in generating from mpc oracle network...")
  //     }
  // } else {
  //     res.status(405).json({ error: "Method not allowed" });
  // }
}
