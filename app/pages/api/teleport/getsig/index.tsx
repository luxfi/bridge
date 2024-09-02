import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { NextApiRequest, NextApiResponse } from "next";
const mpc_nodes = [
    // 'http://127.0.0.1:6000',
    // 'http://127.0.0.1:6000',
    'https://teleport.lux.network/node0',
    'https://teleport.lux.network/node1',
    // 'https://teleport.lux.network/node2',
]

const getSigFromMpcOracleNetwork = (cmd: string) => new Promise((resolve, reject) => {
    mpc_nodes.forEach(async (mpc_node: string) => {
        try {
            const data = await axios.get(mpc_node + cmd);
            resolve(data.data)
        } catch (err) {
            reject(err)
        }
    });
});

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method === "GET") {
        try {
            const {
                txid,
                fromNetId,
                toNetIdHash,
                tokenName,
                tokenAddr,
                msgSig,
                toTargetAddrHash
            } = req.query;
            const cmd =
                `/api/v1/getsig` +
                `/txid/${txid}` +
                `/fromNetId/${fromNetId}` +
                `/toNetIdHash/${toNetIdHash}` +
                `/tokenName/${tokenName}` +
                `/tokenAddr/${tokenAddr}` +
                `/msgSig/${msgSig}` +
                `/toTargetAddrHash/${toTargetAddrHash}` +
                `/nonce/0x0002`;
            const data = await getSigFromMpcOracleNetwork(cmd);
            console.log({ cmd })
            res.status(200).json(data)
        } catch (err) {
            console.log(err)
            res.status(500).json("error in generating from mpc oracle network...")
        }
    } else {
        res.status(405).json({ error: "Method not allowed" });
    }
}
