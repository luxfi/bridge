import type { NextRequest } from 'next/server';
import { mainnetSettings, testnetSettings } from "@/settings";

export async function GET(
  req: NextRequest
) {
  try {
    const searchParams = req.nextUrl.searchParams
    const version = searchParams.get('version')!
    const destination_asset_group = searchParams.get('destination_asset_group')!

    const isMainnet = 
      version === "mainnet" 
      ||
      process.env.NEXT_PUBLIC_API_VERSION === "mainnet"
      
    const settings = isMainnet ? mainnetSettings : testnetSettings;
    const { networks, exchanges } = settings.data;

    if (destination_asset_group) {
      return Response.json(
        {
          data: [
            {
              network: "LUX_MAINNET",
              asset: "LUX",
            },
          ]
        },
        {
          status: 200,
        }  
      )

    } 
    else {
      return Response.json(
        {
          data: [
            ...networks.map((n: any) => ({
              network: n?.internal_name,
              asset: n?.native_currency,
            })),
            ...exchanges.map((e: any) => ({
              network: e?.internal_name,
              asset: e?.display_name,
            })),
          ]
        },
        {
          status: 200,
        }  
      )
    }
  } 
  catch (error: any) {
    console.error("Error in fetching destinations", error);
    return Response.json({error: error.message ?? "Error in fetching sources"}, {status: 500, statusText: error.message ?? "Error in fetching sources"})
  }
}
