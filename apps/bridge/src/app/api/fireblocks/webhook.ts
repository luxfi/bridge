import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../../settings";
import prisma from "../../../lib/db";

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
    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }
    const { btcAddress, walletAddress, amount } = req.body;

    console.log("success");
    return res.status(200).json({
      status: "success",
    });
  } catch (error: any) {
    console.error("Error in updating networks", error);
    res.status(500).json({ data: error.message ?? 'error' });
  }
}
