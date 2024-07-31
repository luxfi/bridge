import { NextApiRequest, NextApiResponse } from "next";
import { handlerGetHasBySwaps, handlerGetSwap } from "../../../helpers/swapHelper";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get dynamic id from URL
  const { transaction_has } = req.query;

  // Get version from query parameter
  const version = req.query.version;
  console.log("transaction_has====", transaction_has);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "GET") {
    try {
      if (transaction_has) {
        const result = await handlerGetHasBySwaps(transaction_has as string);
        console.log("🚀 ~ result:", result);
        res.status(200).json({ data: result });
      } else {
        res.status(200).json({ data: [] });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
