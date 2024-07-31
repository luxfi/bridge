import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../../settings";
import { CryptoNetwork } from "../../../Models/CryptoNetwork";
import prisma from "../../../lib/db";

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
        const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
        // settings
        const settings = isMainnet ? mainnetSettings : testnetSettings;
        const { networks } = settings.data;
        await Promise.all(networks.map(async(n) => {
            await prisma.network.deleteMany();
            await prisma.network.create({
                data: {
                    display_name: n.display_name,
                    internal_name: n.internal_name,
                    native_currency: n.native_currency,
                    is_testnet: n.is_testnet,
                    is_featured: n.is_featured,
                    chain_id: n.chain_id,
                    node_url: n.nodes[0]?.url ?? '',
                    type: n.type,
                    average_completion_time: n.average_completion_time,
                    transaction_explorer_template: n.transaction_explorer_template,
                    account_explorer_template: n.account_explorer_template,
                    listing_date: n.listing_date,
                }
            })
        }));
        return res.status(200).json(
            {
                status: "success"
            }
        )
    } catch (error) {
        console.error("Error in updating networks", error);
        res.status(500).json({ data: error.message });
    }
}
