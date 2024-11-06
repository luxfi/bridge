import type { NextRequest, NextResponse } from 'next/server';
import { handlerGetHasBySwaps } from "@/util/swapHelper";

export async function GET(
  req: NextRequest,
  second: { params: { transaction_has: string }} 
) {

  const { params: { transaction_has }} = second

//  const searchParams = req.nextUrl.searchParams
//  const version = searchParams.get('version')!

  console.log("transaction_has====", transaction_has);

  try {
    if (transaction_has) {
      const result = await handlerGetHasBySwaps(transaction_has);
      console.log("🚀 ~ result:", result);
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
    else {
      return Response.json(
        { data: [] },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true"  
          }
        }  
      )
    }
  } 
  catch (error: any) {
    return new Response(null, {status: 500, statusText: error.message ?? 'error'})
  }
}
