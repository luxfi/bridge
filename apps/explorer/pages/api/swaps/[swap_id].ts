import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get dynamic id from URL
  const { swap_id } = req.query;

  // Get version from query parameter
  const version = req.query.version;
  console.log("swap_id====", swap_id);
  res.status(200).json({ data: {} });
  // if (req.method === "GET") {
  //   try {
  //     const result = await handlerGetSwap(swap_id as string);
  //     res.status(200).json({ data: { ...result } });
  //   } catch ( error: any ) {
  //     res.status(500).json({ error: error.message });
  //   }
  // } else {
  //   res.setHeader("Allow", ["GET"]);
  //   res.status(405).end(`Method ${req.method} Not Allowed`);
  // }
}
