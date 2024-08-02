import { NextApiRequest, NextApiResponse } from "next";
import { getTokenPrice } from "../../../../helpers/tokenHelper";

/**
 * get token price
 * @param req 
 * @param res 
 * /api/tokens/price/ETH
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { token_id } = req.query;
  const price = await getTokenPrice (String(token_id));
  res.status(200).json({
    data: {
        asset: token_id,
        price
    }
  });
}
