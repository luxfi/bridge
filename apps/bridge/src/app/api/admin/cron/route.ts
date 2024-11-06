import type { NextRequest, NextResponse } from 'next/server';
//import Web3 from "web3";

import prisma from "@/lib/db";

import { SwapStatus } from "@/Models/SwapStatus";
import type { Swap, Network, Currency } from '@/Models/Swap';

const checkSwap = async (swap: Swap) => {
  const delay = Date.now() - new Date(swap.created_date).getTime();
  if (delay > 0.1 * 60 * 1000) { // if there is no deposit for 15 mins
    console.log("expired =======>", swap.id)
    await prisma.swap.update({
      where: {
        id: swap.id
      },
      data: {
        status: SwapStatus.Expired
      }
    })
  }
}

export async function POST(
  request: NextRequest
) {

  const swaps = await prisma.swap.findMany({
    where: {
      status: SwapStatus.UserTransferPending
    },
    include: {
      source_network: true,
      source_asset: true,
      destination_network: true,
      destination_asset: true,
      deposit_address: true,
    }
  });

    // :aa wtf?
  // await Promise.all(swaps.map(checkSwap))

  return Response.json( { status: 'success'}, { status: 200, statusText: 'success' });

}
