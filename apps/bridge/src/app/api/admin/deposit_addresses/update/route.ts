import type { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/db";
import {
    deposit_addresses,
} from "@/settings";

/**
 * update deposit addresses of DB from setting file
 * api/deposit_addresses/update
 * @param req 
 * @param res 
 */
export async function POST (
  req: NextRequest,
) {
  await prisma.depositAddress.deleteMany();
  // await Promise.all(Object.entries(deposit_addresses).map(([key, addresses]) => prisma.depositAddress.createMany({
  //     data: addresses.map((a: string) => ({
  //         address: a,
  //         type: key
  //     }))
  // })));
  const data = Object.entries(deposit_addresses);
  for (let index = 0; index < data.length; index++) {
      const [key, addresses] = data[index];
      await prisma.depositAddress.createMany({
          data: addresses.map((a: string) => ({
              address: a,
              type: key
          }))
      })
  }

  return Response.json({ status: 'success' }, {status: 200, statusText: 'success'})
}

