import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/db";

/**
 * update network and currencies according to settings file
 * api/networks/update
 *
 * @param req
 * @param res
 * @returns
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await prisma.quote.deleteMany({});
    console.log("deleted quote...");
    await prisma.depositAction.deleteMany({});
    console.log("deleted depositAction...");
    await prisma.swap.deleteMany({});
    console.log("deleted swap...");
    await prisma.currency.deleteMany({});
    console.log("deleted currency...");
    await prisma.rpcNode.deleteMany({});
    console.log("deleted rpcNode...");
    await prisma.network.deleteMany({});
    console.log("deleted network...");
    
    console.log("All db deleted");
    return res.status(200).json({
      status: "All db deleted",
    });
  } catch (error: any) {
    console.error("Error in updating networks", error);
    res.status(500).json({ data: error.message });
  }
}
