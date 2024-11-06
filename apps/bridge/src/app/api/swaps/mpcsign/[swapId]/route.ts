import type { NextRequest } from 'next/server';
import { handlerUpdateMpcSignAction } from "@/util/swapHelper";

export async function POST(
  req: NextRequest,
  second: { params: { swapId: string }}
) {
  const { params: { swapId }} = second

  const { txHash, amount, from, to } = await req.json();
  try {
    const result = await handlerUpdateMpcSignAction(
      swapId,
      txHash,
      Number(amount),
      from,
      to
    );
    return Response.json(
      { data: result },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": "true"  
        }
      }  
    )
  } 
  catch (error: any) {
    return new Response(null, {status: 500, statusText: error.message ?? 'error'})
  }
}
