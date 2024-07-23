import { NextApiRequest, NextApiResponse } from "next";
import { handlerGetSwap } from "../swapAction";
import { mainnetSettings, testnetSettings, deposit_addresses } from "../../../settings";
import { NetworkType } from "../../../Models/CryptoNetwork";

function getRandomInt(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1) + a);
}

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

  const _network = networks.find((n) => n.internal_name === network);
  const networkType = _network?.type ?? NetworkType.EVM;

  const addresses: string[] = deposit_addresses[networkType] ?? deposit_addresses[NetworkType.EVM];
  const address = addresses[getRandomInt(0, addresses.length - 1)];

  res.status(200).json({
    data: {
      type: networkType,
      address
    }
  });
}
