import { NextApiRequest, NextApiResponse } from "next";

import { handleSwapCreation, handlerGetSwaps } from "./swapAction";
import { mainnetSettings, testnetSettings } from "../../settings";
import { boolean } from "joi";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    const settings = isMainnet ? mainnetSettings : testnetSettings;

    let contractAddress =
      req.body.sourceNetwork.includes("STARKNET") &&
      settings.contractAddress.data.find((res) => {
        return res.contract_name === "STARKNET";
      });

    if (!contractAddress) {
      contractAddress = getRandomObjectExceptSTARKNET(
        settings.contractAddress.data
      );
    }
    try {
      const result = await handleSwapCreation(req.body);
      res.status(200).json({ data: { ...result, contractAddress } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === "GET") {
    const isDeleted =
      (req.query.isDeleted && Boolean(Number(req.query.isDeleted))) ||
      undefined;
    console.log("isDeleted", isDeleted, req.query.isDeleted);

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
