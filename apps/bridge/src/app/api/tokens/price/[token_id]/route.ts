import type { NextRequest } from 'next/server';
import { getTokenPrice } from "@/util/tokenHelper";

export async function GET (
  req: NextRequest,
  second: { params: { token_id: string }}
) {
  const { params: { token_id }} = second

  const price = await getTokenPrice(token_id)
  return Response.json(
    { data: {
        asset: token_id,
        price
    }},
    {
      status: 200,
    }  
  )
}
