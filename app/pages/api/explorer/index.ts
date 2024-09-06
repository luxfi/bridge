import { NextApiRequest, NextApiResponse } from "next";
import { handlerGetExplorer, handlerGetSwap } from "../../../helpers/swapHelper";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get dynamic id from URL
  const { statuses } = req.query;

  // Get version from query parameter
  const version = req.query.version;
  console.log("transaction_has====", statuses);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "GET") {
    try {
      const result = await handlerGetExplorer(statuses as string[]);
      console.log("🚀 ~ result:", result);
      res.status(200).json({ data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
