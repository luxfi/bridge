import type { NextRequest, NextResponse } from 'next/server';
import { handlerGetExplorer, handlerGetSwap } from "@/util/swapHelper";

export async function GET(
  req: NextRequest,
) {

  const searchParams = req.nextUrl.searchParams
  const statuses = searchParams.getAll('statuses')!
//  const version = searchParams.get('version')!
  
  console.log("transaction_has====", statuses);

  try {
    const result = await handlerGetExplorer(statuses);
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
  } catch (error: any) {
    return new Response(null, {status: 500, statusText: error.message ?? 'error'})
  }
}
