import { NextResponse, type NextRequest } from 'next/server';
import prisma from "@/lib/db";

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
    await prisma.quote.deleteMany({});
    console.log("deleted quote...");
    await prisma.depositAction.deleteMany({});
    console.log("deleted depositAction...");
    await prisma.swap.deleteMany({});
    console.log("deleted swap...");
    await prisma.currency.deleteMany({});
    console.log("deleted currency...");
    await prisma.rpcNode.deleteMany({});
    console.log("deleted rpcNode...");
    await prisma.network.deleteMany({});
    console.log("deleted network...");
    
    console.log("All db deleted");

    return NextResponse.json({ status: "all db deleted"} , { status: 200, statusText: "all db deleted" })
  } 
  catch (error: any) {
    console.error("Error in updating networks", error);
    return NextResponse.json({
      error: error.message ?? "Error in updating networks" 
   }, { 
    status: 500, 
    statusText: error.message ?? "Error in updating networks" 
  })
  }
}
