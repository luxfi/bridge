import type { NextRequest, NextResponse } from 'next/server';
import { mainnetSettings, testnetSettings } from "@/settings";

export async function GET(
  req: NextRequest,
) {
  try {
    const searchParams = req.nextUrl.searchParams
    const versionFromQuery = searchParams.get('version')
    const destination_network = searchParams.get('destination_network')

    const isMainnet =
      versionFromQuery === "mainnet" ||
      process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    const settings = isMainnet ? mainnetSettings : testnetSettings;

    const { exchanges, networks } = settings.data;

    const exchange = exchanges.find(
      (e: any) => e?.internal_name === destination_network
    );
    const network = networks.find(
      (e: any) => e?.internal_name === destination_network
    );

    if (exchange) {
      return Response.json(
        { data: exchange.currencies.map((c: any) => ({
          network: c.network,
          asset: c.asset,
        }))},
        {
          status: 200
        }
      );

    } else if (network) {
      return Response.json(
        { data: network.currencies.map((c: any) => ({
          network: network.internal_name,
          asset: c.asset,
        }))},
        {
          status: 200
        }
      );
    } else {
      // If neither exchange nor network is found
      return Response.json([], {status: 200});
    }
  } catch (error: any) {
    console.error("Error in fetching destination currencies", error);
    return new Response(null, {status: 500, statusText: error.message ?? "Error in fetching destination currencies"})
  }
}
