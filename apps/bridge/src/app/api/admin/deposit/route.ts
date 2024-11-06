import { NextResponse, type NextRequest } from 'next/server';

import Joi from "joi";

export interface SwapTransactionRequest {
  amount: number;
  source_network: string;
  source_exchange?: string;
  source_asset: string;
  source_address: string;
  destination_network: string;
  destination_exchange?: string;
  destination_asset: string;
  destination_address: string;
  refuel: boolean;
  use_deposit_address: boolean;
}

const swapTransactionSchema = Joi.object({
  amount: Joi.number().required(),
  source_network: Joi.string().required(),
  source_asset: Joi.string().required(),
  source_address: Joi.string().required(),
  destination_network: Joi.string().required(),
  destination_asset: Joi.string().required(),
  destination_address: Joi.string().required(),
  refuel: Joi.boolean(),
  use_deposit_address: Joi.boolean(),
});

export async function POST (
  req: NextRequest,
) {

  const body = await req.json()
  const { error, value } = swapTransactionSchema.validate(body);

  if (error) {
    return Response.json(
      {
        error: 'Invalid request data',
        details: error.details
      }, 
      {
        status: 400,
        statusText: `Invalid request data: ${error.details}`
      }
    )
  }
  const {
    amount,
    source_network,
    source_exchange,
    source_asset,
    source_address,
    destination_network,
    destination_exchange,
    destination_asset,
    destination_address,
    refuel,
    use_deposit_address,
  }: SwapTransactionRequest = value;

  try {
    // const newSwapTransaction = await prisma.swapUserInfo.create({
    //   data: {
    //     amount,
    //     source_network,
    //     source_exchange,
    //     source_asset,
    //     source_address,
    //     destination_network,
    //     destination_exchange,
    //     destination_asset,
    //     destination_address,
    //     use_deposit_address,
    //     refuel,
    //   },
    // });
      // :aa no outer 'data' for some reason.
    return Response.json(
      { 
        id: "newSwapTransaction.id", 
        message: "Success" 
      }, {
        status: 200
      })
  } catch ( error: any ) {
    console.error(error);
    return Response.json(
      {
        error: "Error adding swap transaction to the database"
      }, 
      {
        status: 500,
        statusText: "Error adding swap transaction to the database"
      }
    )
  }
}
