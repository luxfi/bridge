import type { NextRequest, NextResponse } from 'next/server'

/**
 * get limit data for swap
 * /limits/from/fromCurrency/to/toCurrency?version=
 * 
 * @param req { amount, version, params: [source, source_asset, destination, destination_asset] }
 * @param res 
 */

export async function GET(
  req: NextRequest
) {
    //const { amount, version, params } = req.query;
    //const [source, source_asset, destination, destination_asset] = params as string[];
    return Response.json(
      { data: {
        manual_min_amount: 0.1,
        manual_min_amount_in_usd: 0,
        max_amount: 100,
        max_amount_in_usd: 0,
        wallet_min_amount: 0,
        wallet_min_amount_in_usd: 0
      }},
      {
        status: 200,
      }  
    )

}
