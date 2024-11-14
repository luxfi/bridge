import type { NextRequest } from 'next/server';
//import Web3 from "web3";

//import { SwapStatus } from "@/Models/SwapStatus";
//import type { Swap, Network, Currency } from '@/Models/Swap';

/*
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
*/
export async function POST(
  request: NextRequest
) {

  return Response.json( { status: 'success'}, { status: 200, statusText: 'success' });

}
