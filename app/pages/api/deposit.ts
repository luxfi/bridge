import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const depositAddress = "lux_wallet_address_example";
  res.status(200).json({ address: depositAddress });
}
