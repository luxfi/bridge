import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../../settings";
import { CryptoNetwork } from "../../../Models/CryptoNetwork";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{
    data: CryptoNetwork[] | any;
  }>
) {
  try {
    const { version } = req.query;
    const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    // settings
    const settings = isMainnet ? mainnetSettings : testnetSettings;
    const { networks } = settings.data;
    return res.status(200).json(
      {
        data: networks
      }
    )
  } catch (error) {
    console.error("Error in fetching networks", error);
    res.status(500).json({ data: error.message });
  }
}
