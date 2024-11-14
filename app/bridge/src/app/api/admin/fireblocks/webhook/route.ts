import type { NextRequest } from 'next/server';
//import { mainnetSettings, testnetSettings } from "@/settings";
//import prisma from "@/lib/db";

/**
 * update network and currencies according to settings file
 * api/networks/update
 *
 * @param req
 * @param res
 * @returns
 */
export async function POST(
  req: NextRequest,
) {
  try {
    //const { btcAddress, walletAddress, amount } = req.body;

    // :aa what does this do??

    console.log("success");
    return Response.json({status: "success"}, {status: 200, statusText: "success"})
  } 
  catch (error: any) {
    console.error("Error in updating networks", error);
    return Response.json({error: "Error in updating networks"}, {status: 500, statusText: "Error in updating networks" })
  }
}
