import type { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/db";
import {
    mainnetSettings,
    testnetSettings,
    deposit_addresses,
} from "@/settings";
import { NetworkType } from "@/Models/CryptoNetwork";

function getRandomInt(a: number, b: number) {
    return Math.floor(Math.random() * (b - a + 1) + a);
}


export async function GET(
  req: NextRequest,
) {

  const searchParams = req.nextUrl.searchParams
  const network = searchParams.get('network')!
  const version = searchParams.get('version')!

  const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
  // settings
  const settings = isMainnet ? mainnetSettings : testnetSettings;
  const { networks } = settings.data;

  const _network = networks.find((n) => n.internal_name === network);
  const networkType = _network?.type ?? NetworkType.EVM;
  const addresses: string[] = deposit_addresses[networkType] ?? deposit_addresses[NetworkType.EVM];
  const address = addresses[getRandomInt(0, addresses.length - 1)];

  const data = await prisma.depositAddress.findMany({
    where: { type: networkType },
    select: {
        address: true
    }
  });

  return Response.json(
    { data: {
      type: networkType,
      address,
    }},
    {
      status: 200
    }
  )
}

