import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings } from "@/settings";
import prisma from "@/lib/db";

/**
 * update network and currencies according to settings file
 * api/networks/update
 *
 * @param req
 * @param res
 * @returns
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { version } = req.query;
    const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    // settings
    const settings = mainnetSettings;
    const { networks } = settings.data;
    await prisma.quote.deleteMany({});
    console.log("deleted quote...");
    await prisma.depositAction.deleteMany({});
    console.log("deleted depositAction...");
    await prisma.swap.deleteMany({});
    console.log("deleted swap...");
    await prisma.currency.deleteMany({});
    console.log("deleted currency...");
    await prisma.rpcNode.deleteMany({});
    console.log("deleted rpcNode...");
    await prisma.network.deleteMany({});
    console.log("deleted network...");

    let rpcCount = 0, networksCount = 0, currenciesCount = 0;
    for (let index = 0; index < networks.length; index++) {
      const n = networks[index];
      const _network = await prisma.network.create({
        data: {
          display_name: n.display_name,
          internal_name: n.internal_name,
          native_currency: n.native_currency,
          is_testnet: n.is_testnet,
          is_featured: n.is_featured,
          chain_id: n.chain_id,
          type: n.type,
          average_completion_time: n.average_completion_time,
          transaction_explorer_template: n.transaction_explorer_template,
          account_explorer_template: n.account_explorer_template,
        },
      });
      await prisma.rpcNode.createMany({
        data: n.nodes.map((n: any) => ({
          network_id: _network.id,
          url: n.url,
        })),
      });
      await prisma.currency.createMany({
        data: n.currencies.map((c: any) => ({
          network_id: _network.id,
          name: c.asset,
          asset: c.asset,
          contract_address: c.contract_address,
          decimals: c.decimals,
          price_in_usd: c.price_in_usd,
          precision: c.precision,
          is_native: c.is_native,
        })),
      });
      networksCount ++;
      rpcCount += n.nodes.length;
      currenciesCount += n.currencies.length;
    }
    return res.status(200).json({
      status: "success",
      data: { rpcCount, networksCount, currenciesCount }
    });
  } catch (error) {
    console.error("Error in updating networks", error);
    res.status(500).json({ data: error.message });
  }
}
