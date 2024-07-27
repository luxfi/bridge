import type { NextApiRequest, NextApiResponse } from "next";

import {
  mainnetSettings,
  testnetSettings,
  deposit_addresses,
} from "../../settings";
export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  return response.json({ deposit_addresses });
}
