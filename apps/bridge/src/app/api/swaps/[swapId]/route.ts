import type { NextRequest } from 'next/server';
import { handlerGetSwap } from "@/util/swapHelper";

export async function GET(
  req: NextRequest,
  second: { params: { swapId: string }}
) {

  const { params: { swapId }} = second

  //const searchParams = req.nextUrl.searchParams
  //const version = searchParams.get('version')!

  try {
    const result = await handlerGetSwap(swapId);
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
    return Response.json({error: error.message ?? 'error'}, {status: 500, statusText: error.message ?? 'error'})
  }
}
