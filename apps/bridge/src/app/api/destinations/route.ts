import type { NextRequest } from 'next/server';
import { mainnetSettings, testnetSettings } from "@/settings";

export async function GET(
  req: NextRequest,
) {
  try {
    const searchParams = req.nextUrl.searchParams
    const source_asset_group = searchParams.get('source_asset_group')!
    const source_network = searchParams.get('source_network')!
    const version = searchParams.get('version')!

    const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    // settings
    const settings = isMainnet ? mainnetSettings : testnetSettings;

    const { networks, exchanges } = settings.data;

    if (source_network === 'LUX_MAINNET') {
      return Response.json(
        [
          {
              network: 'LUXUSA',
              asset: 'LUX'
          },
          {
              network: 'LUXFI',
              asset: 'LUX'
          },
        ],
        {
          status: 200,
        }  
      )
    } 
    else if (source_network || source_asset_group) {
      return Response.json(
        [
          {
            network: 'LUX_MAINNET',
            asset: 'LUX'
          }
        ],
        {
          status: 200,
        }  
      )
    } 
    else {
      return Response.json(
        [
            {
                network: 'LUXUSA',
                asset: 'LUX'
            },
            {
                network: 'LUXFI',
                asset: 'LUX'
            },
            {
                network: 'LUX_MAINNET',
                asset: 'LUX'
            }
        ],
        {
          status: 200,
        }  
      )

    }
  } 
  catch (error: any ) {
    console.error("Error in fetching destinations", error);
    return new Response(null, {status: 500, statusText: error.message ?? "Error in fetching destinations"})
  }
}
