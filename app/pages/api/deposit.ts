import { PrismaClient } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";

import Joi from "joi";

export interface SwapTransactionRequest {
  amount: number;
  destination_address: string;
  destination_network: string;
  destination_token: string;
  refuel: boolean;
  source_address: string;
  source_network: string;
  source_token: string;
  use_deposit_address: boolean;
}

const prisma = new PrismaClient();

const swapTransactionSchema = Joi.object({
  amount: Joi.number().required(),
  destination_address: Joi.string().required(),
  destination_network: Joi.string().required(),
  destination_token: Joi.string().required(),

  source_address: Joi.string().required(),
  source_network: Joi.string().required(),
  source_token: Joi.string().required(),
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
      destination_address,
      destination_network,
      destination_token,
      refuel,
      source_address,
      source_network,
      source_token,
      use_deposit_address,
    }: SwapTransactionRequest = value;

    try {
      const newSwapTransaction = await prisma.swapUserInfo.create({
        data: {
          amount,
          destinationAddress: destination_address,
          destinationNetwork: destination_network,
          destinationToken: destination_token,
          refuel,
          sourceAddress: source_address,
          sourceNetwork: source_network,
          sourceToken: source_token,
          useDepositAddress: use_deposit_address,
        },
      });

      res.status(200).json({ id: newSwapTransaction.id, message: "Success" });
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
