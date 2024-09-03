import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * get limit data for swap
 * /limits/from/fromCurrency/to/toCurrency?version=
 * 
 * @param req { amount, version, params: [source, source_asset, destination, destination_asset] }
 * @param res 
 */

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<{
        data: {
            manual_min_amount: number
            manual_min_amount_in_usd: number
            max_amount: number
            max_amount_in_usd: number
            wallet_min_amount: number
            wallet_min_amount_in_usd: number
        }
    }>
) {
    const { amount, version, params } = req.query;
    const [source, source_asset, destination, destination_asset] = params as string[];
    res.status(200).json({
        data: {
            manual_min_amount: 0.1,
            manual_min_amount_in_usd: 0,
            max_amount: 100,
            max_amount_in_usd: 0,
            wallet_min_amount: 0,
            wallet_min_amount_in_usd: 0
        }
    });
}
