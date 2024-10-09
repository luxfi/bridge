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
    const data = await prisma.quote.findMany({});

    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    console.error("Error in updating networks", error);
    res.status(500).json({ data: error.message });
  }
}
