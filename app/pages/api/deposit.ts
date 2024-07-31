import { PrismaClient } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";

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

const prisma = new PrismaClient();

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const { error, value } = swapTransactionSchema.validate(req.body);

    if (error) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.details });
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
      res.status(200).json({ id: 'newSwapTransaction.id', message: "Success" });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ error: "Error adding swap transaction to the database" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
