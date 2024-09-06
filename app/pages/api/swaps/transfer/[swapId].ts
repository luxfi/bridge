import { NextApiRequest, NextApiResponse } from "next";
import { handlerUpdateUserTransferAction } from "@/helpers/swapHelper";

/**
 * get swap data
 * @param req 
 * @param res 
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get dynamic id from URL
  const { swapId } = req.query;
  // Get version from query parameter
  const version = req.query.version;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "POST") {
    const { txHash, amount, from, to } = req.body;
    try {
      const result = await handlerUpdateUserTransferAction(
        swapId as string,
        txHash,
        Number(amount),
        from,
        to
      );
      res.status(200).json({ data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
