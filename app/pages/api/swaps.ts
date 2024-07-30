import { NextApiRequest, NextApiResponse } from "next";

import { handleSwapCreation, handlerGetSwaps } from "./swapAction";
import { mainnetSettings, testnetSettings } from "../../settings";
import { boolean } from "joi";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // res.setHeader('Access-Control-Allow-Origin', 'https://example.com');

  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "POST") {
    const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    
    // TODO: calculate deposit_address & current block_number
    const deposit_address_id = 1;
    const block_number = 1;

    try {
      const result = await handleSwapCreation({
        ...req.body,
        deposit_address_id,
        block_number
      });
      res.status(200).json({ data: { ...result } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === "GET") {
    const isDeleted =
      (req.query.isDeleted && Boolean(Number(req.query.isDeleted))) ||
      undefined;
    console.log("isDeleted", isDeleted, req.query.isDeleted);

    console.log(req.query);

    const result = await handlerGetSwaps(
      req.query.address as string,
      isDeleted
    );
    console.log("result", result);

    res.status(200).json({ data: result });
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

function getRandomObjectExceptSTARKNET(arr: any[]) {
  const filteredArr = arr.filter(
    (item: { contract_name: string }) => item.contract_name !== "STARKNET"
  );
  const randomIndex = Math.floor(Math.random() * filteredArr.length);
  return filteredArr[randomIndex];
}
