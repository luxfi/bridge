import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/db";

import Web3 from "web3";
import { mainnet } from "viem/chains";
import { SwapStatus } from "@/Models/SwapStatus";
import { swap } from "formik";

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  
  const swaps = await prisma.swap.findMany({
    where: {
      status: SwapStatus.UserTransferPending
    }
  });

  console.log(swaps)

  return response.json({ 'status': "success" });
 
}
