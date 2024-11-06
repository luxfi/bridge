import type { NextRequest, NextResponse } from 'next/server';

import Joi from "joi";

import {
  //handleSwapCreation,
  //handlerGetSwaps,
  handlerUpdateSwaps,
} from "@/util/swapHelper";
//import { mainnetSettings, testnetSettings } from "@/settings";

const swapTransactionSchema = Joi.object({
  id: Joi.string().required(),
}).unknown(true);

export async function POST(
  req: NextRequest,
) {
  try {
    const body = await req.json()
    const { error, value } = swapTransactionSchema.validate(body);

    if (error) {
      return new Response(null, {status: 400, statusText: `Invalid request data: ${error.details}`})
    }
    const result = await handlerUpdateSwaps(value);
    return Response.json(
      { data: result },
      {
        status: 200,
      }  
    )
  } 
  catch (error: any) {
    return Response.json({ error: 'error'}, {status: 500, statusText: error.message ?? 'error'})
  }
}
