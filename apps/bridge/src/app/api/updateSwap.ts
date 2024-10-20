import type { NextApiRequest, NextApiResponse } from "next";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    try {
      const { error, value } = swapTransactionSchema.validate(req.body);

      if (error) {
        return res
          .status(400)
          .json({ error: "Invalid request data", details: error.details });
      }
      const result = await handlerUpdateSwaps(value);
      res.status(200).json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
