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
    const settings = isMainnet ? mainnetSettings : testnetSettings;

    let contract_address =
      req.body.source_network?.includes("STARKNET") &&
      settings.contractAddress.data.find((res) => {
        return res.contract_name === "STARKNET";
      });

    if (!contract_address) {
      contract_address = getRandomObjectExceptSTARKNET(
        settings.contractAddress.data
      );
    }

    try {
      const result = await handleSwapCreation({ ...req.body, contract_address });
      res.status(200).json({ data: { ...result } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === "GET") {
    const isDeleted =
      (req.query.isDeleted && Boolean(Number(req.query.isDeleted))) ||
      undefined;
    console.log("isDeleted", isDeleted, req.query.isDeleted);

    console.log(req.query)

    const result = await handlerGetSwaps(
      req.query.address as string,
      isDeleted
    );
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
