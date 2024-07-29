import type { NextApiRequest, NextApiResponse } from "next";

import {
  mainnetSettings,
  testnetSettings,
  deposit_addresses,
} from "../../settings";
import Web3 from "web3";

import { createClient, http } from "viem";
import { mainnet } from "viem/chains";

const infuraProjectId = process.env.INFURA_API_KEY;

const web3 = new Web3(`https://sepolia.infura.io/v3/${infuraProjectId}`);

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  console.log(deposit_addresses);
  try {
    const latestBlockNumber = await web3.eth.getBlockNumber();
    console.log("🚀 ~ latestBlockNumber:", latestBlockNumber);
    const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - 1 * 60;

    const balances = await Promise.all(
      deposit_addresses.evm.map(async (address) => {
        const balance = await web3.eth.getBalance(address);
        return { address, balance: web3.utils.fromWei(balance, "ether") };
      })
    );
    console.log("🚀 ~ balances:", balances);

    // const incomingTransactions = await Promise.all(
    //   deposit_addresses.evm.map(async (address) => {
    //     let recentIncomingTx = null;
    //     let currentBlockNumber = latestBlockNumber;

    //     while (currentBlockNumber >= 0) {
    //       const block = await web3.eth.getBlock(currentBlockNumber, true);
    //       if (!block || !block.timestamp) break; // If the block does not exist, exit the loop

    //       if (block.transactions) {
    //         console.log(
    //           "🚀 ~ deposit_addresses.evm.map ~ block.transactions:",
    //           block.transactions
    //         );
    //         for (const tx of block.transactions) {
    //           if (tx.to === address) {
    //             recentIncomingTx = tx;
    //             break;
    //           }
    //         }
    //       }
    //       console.log(
    //         "🚀 ~ deposit_addresses.evm.map ~ recentIncomingTx:",
    //         recentIncomingTx
    //       );
    //       if (recentIncomingTx === null) break; // Exit the loop after finding the most recent received transaction

    //       if (recentIncomingTx || !recentIncomingTx) break; // Exit the loop after finding the most recent received transaction

    //       currentBlockNumber--;
    //     }

    //     return { address, recentIncomingTx };
    //   })
    // );

    // return response.json({});

    return response.json({ balances });
  } catch (error) {
    console.error("Error fetching balance and transactions:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}
