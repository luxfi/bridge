import type { NextRequest, NextResponse } from 'next/server';
import { handlerUpdateUserTransferAction } from "@/util/swapHelper";

/**
 * get swap data
 * @param req 
 * @param res 
 */
export async function POST(
  req: NextRequest,
  second: { params: { swapId: string }}
) {
  const { params: { swapId }} = second

  const { txHash, amount, from, to } = await req.json();
  try {
    const result = await handlerUpdateUserTransferAction(
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
