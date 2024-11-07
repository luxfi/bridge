import type { NextRequest } from 'next/server';
import { mainnetSettings, testnetSettings } from "@/settings";

// https://github.com/vercel/next.js/discussions/62725
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
) {
  try {
    const searchParams = req.nextUrl.searchParams
    const version = searchParams.get('version')!

    const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    const settings = isMainnet ? mainnetSettings : testnetSettings;
    const { exchanges } = settings.data;
    return Response.json(
      { data: exchanges },
      {
        status: 200,
      }  
    )
  } 
  catch (error: any) {
    console.error("Error in fetching networks", error);
    return new Response(null, {status: 500, statusText: error.message ?? "Error in fetching networks"})
  }
}
