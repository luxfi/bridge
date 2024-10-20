// import type { NextApiRequest, NextApiResponse } from "next";
// import { mainnetSettings } from "@/settings";
// import prisma from "@/lib/db";

// /**
//  * update network and currencies according to settings file
//  * api/networks/update
//  *
//  * @param req
//  * @param res
//  * @returns
//  */
// export default async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse
// ) {
//   try {
//     // settings
//     const settings = mainnetSettings;
//     const { networks } = settings.data;
//     await prisma.quote.deleteMany({});
//     console.log("deleted quote...");
//     await prisma.depositAction.deleteMany({});
//     console.log("deleted depositAction...");
//     await prisma.swap.deleteMany({});
//     console.log("deleted swap...");
//     await prisma.currency.deleteMany({});
//     console.log("deleted currency...");
//     await prisma.rpcNode.deleteMany({});
//     console.log("deleted rpcNode...");
//     await prisma.network.deleteMany({});
//     console.log("deleted network...");
//     const { count: networksCount } = await prisma.network.createMany({
//       data: networks.map((n) => ({
//         display_name: n.display_name,
//         internal_name: n.internal_name,
//         native_currency: n.native_currency,
//         is_testnet: n.is_testnet,
//         is_featured: n.is_featured,
//         chain_id: n.chain_id,
//         type: n.type,
//         average_completion_time: n.average_completion_time,
//         transaction_explorer_template: n.transaction_explorer_template,
//         account_explorer_template: n.account_explorer_template,
//       })),
//     });
//     const _networks = await prisma.network.findMany();
//     const rpcNodes: any[] = [];
//     const currencies: any[] = [];

//     for (let i = 0; i < networks.length; i++) {
//       const _network = networks[i];
//       const network_id = _networks.find(
//         (n) => n.internal_name === _network.internal_name
//       )?.id;

//       rpcNodes.push(
//         ..._network.nodes.map((n: any) => ({
//           network_id,
//           url: n.url,
//         }))
//       );
//       currencies.push(
//         ..._network.currencies.map((c: any) => ({
//           network_id,
//           name: c.asset,
//           asset: c.asset,
//           contract_address: c.contract_address,
//           decimals: c.decimals,
//           price_in_usd: c.price_in_usd,
//           precision: c.precision,
//           is_native: c.is_native,
//         }))
//       );
//     }

//     const { count: rpcCount } = await prisma.rpcNode.createMany({
//       data: rpcNodes,
//     });
//     const { count: currenciesCount } = await prisma.currency.createMany({
//       data: currencies,
//     });

//     return res.status(200).json({
//       status: "success",
//       data: { rpcCount, networksCount, currenciesCount },
//     });
//   } catch (error) {
//     console.error("Error in updating networks", error);
//     res.status(500).json({ data: error.message });
//   }
// }
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
    // settings
    const settings = mainnetSettings;
    const { networks } = settings.data;
    console.log("::staring update networks data.");
    let currenciesCount = 0;

    for (let i = 0; i < networks.length; i++) {
      const _network = networks[i];
      const { id: networkId } = await prisma.network.upsert({
        where: { internal_name: _network.internal_name }, // Assuming internal_name is unique for each network
        update: {
          display_name: _network.display_name,
          internal_name: _network.internal_name,
          native_currency: _network.native_currency,
          is_testnet: _network.is_testnet,
          is_featured: _network.is_featured,
          type: _network.type,
          average_completion_time: _network.average_completion_time,
          transaction_explorer_template: _network.transaction_explorer_template,
          account_explorer_template: _network.account_explorer_template,
        },
        create: {
          display_name: _network.display_name,
          internal_name: _network.internal_name,
          native_currency: _network.native_currency,
          is_testnet: _network.is_testnet,
          is_featured: _network.is_featured,
          chain_id: _network.chain_id,
          type: _network.type,
          average_completion_time: _network.average_completion_time,
          transaction_explorer_template: _network.transaction_explorer_template,
          account_explorer_template: _network.account_explorer_template,
        },
      });
      console.log(`${i}. ` + _network.internal_name);
      for (const token of _network.currencies as any) {
        await prisma.currency.upsert({
          where: {
              // :aa TODO
            network_id_asset: {
              network_id: networkId,
              asset: token.asset,
            },
          },
          update: {
            network_id: networkId,
            name: token.name,
            asset: token.asset,
            contract_address: token.contract_address,
            decimals: token.decimals,
            price_in_usd: token.price_in_usd,
            precision: token.precision,
            is_native: token.is_native,
          },
          create: {
            network_id: networkId,
            name: token.name,
            asset: token.asset,
            contract_address: token.contract_address,
            decimals: token.decimals,
            price_in_usd: token.price_in_usd,
            precision: token.precision,
            is_native: token.is_native,
          },
        });
      }
      currenciesCount += _network.currencies.length;
    }
    console.log("::end networks update");

    return res.status(200).json({
      status: "success",
      data: { networksCount: networks.length, currenciesCount },
    });
  } catch (error: any) {
    console.error("Error in updating networks", error);
    res.status(500).json({ data: error.message });
  }
}
