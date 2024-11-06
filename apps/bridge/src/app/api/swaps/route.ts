import type { NextRequest, NextResponse } from 'next/server';
import { handleSwapCreation, handlerGetSwaps, type SwapData } from "@/util/swapHelper";

export async function POST( req: NextRequest ) {

  const body = req.json() as unknown as SwapData

  try {
    const result = await handleSwapCreation(body)
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
    console.log(error);
    return new Response(null, {status: 500, statusText: error.message ?? 'error'})
  }
}  
  
export async function GET( req: NextRequest ) {

  const searchParams = req.nextUrl.searchParams
  const isDeleted = searchParams.get('isDeleted')!
  const address = searchParams.get('address')!

  const _isDeleted = (isDeleted && Boolean(Number(isDeleted))) || undefined;

  const result = await handlerGetSwaps(
    address,
    _isDeleted
  )
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
