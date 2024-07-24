import { NextApiRequest, NextApiResponse } from "next";
import { getTokenPrice } from "../../tokenAction";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get dynamic id from URL
  const { swap_id } = req.query;

  // Get version from query parameter
  const { token_id } = req.query;

  const price = await getTokenPrice (String(token_id));
  res.status(200).json({
    data: {
        asset: token_id,
        price
    }
  });

//   if (req.method === "GET") {
//     try {
//       const result = await handlerGetSwap(swap_id as string);
//       console.log("swap get result:", { result });

//       res.status(200).json({ data: result });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   } else {
//     res.setHeader("Allow", ["GET"]);
//     res.status(405).end(`Method ${req.method} Not Allowed`);
//   }
}
