import type { NextApiRequest, NextApiResponse } from "next";
import { handleSwapCreation, handlerGetSwaps } from "../../util/swapHelper";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "POST") {
    try {
      const result = await handleSwapCreation({
        ...req.body,
      });
      res.status(200).json({ data: { ...result } });
    } catch (error: any) {
      console.log(error);
      res.status(500).json({ error: error.message ?? 'error'});
    }
  } else if (req.method === "GET") {
    const isDeleted =
      (req.query.isDeleted && Boolean(Number(req.query.isDeleted))) ||
      undefined;
    const result = await handlerGetSwaps(
      req.query.address as string,
      isDeleted
    );
    res.status(200).json({ data: result });
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}