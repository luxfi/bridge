import { NextApiRequest, NextApiResponse } from "next";
import { handlerGetSwap } from "../swapAction";
import { mainnetSettings, testnetSettings } from "../../../settings";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get dynamic id from URL
  const { network } = req.query;

  // Get version from query parameter
  const { version } = req.query;
  const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
  // settings
  const settings = isMainnet ? mainnetSettings : testnetSettings;
  const { exchanges, networks } = settings.data;
  console.log("network for deposit address ====>", network);

  res.status(200).json({ data: {
    type: "evm",
    address: "0xa684c5721e54B871111CE1F1E206d669a7e7F0a5"
  } });

  // res.setHeader('Access-Control-Allow-Origin', 'https://example.com');

//   res.setHeader("Access-Control-Allow-Credentials", "true");
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
