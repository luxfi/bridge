import type { NextRequest } from 'next/server'
import prisma from "@/lib/db"

export async function GET(
  req: NextRequest,
) {
  const data: any = {};
  const types = await prisma.depositAddress.groupBy({
      by: ['type']
  });
  for (let index = 0; index < types.length; index++) {
      const el = types[index];
      const _data = await prisma.depositAddress.findMany({
          where: { type: el.type },
          select: {
              address: true
          }
      });
      data[el.type] = _data.map(_d => _d.address);
  }
  return Response.json(
    data,
    {
      status: 200
    } 
  ) 
}

