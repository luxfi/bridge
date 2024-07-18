import type { NextApiRequest, NextApiResponse } from 'next'
import { mainnetSettings, testnetSettings } from '../../settings'

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<{
        data: {
            network: string;
            asset: string;
        }[]
    }>
) {
    try {
        const versionFromQuery = req.query.version as string;
        const source_network = req.query.source_network as string;
        const isMainnet = versionFromQuery === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
        const settings = isMainnet ? mainnetSettings : testnetSettings;

        const { exchanges, networks } = settings.data;

        const exchange = exchanges.find(
            (e) => e.internal_name === source_network
        );
        const network = networks.find(
            (e) => e.internal_name === source_network
        );

        if (exchange) {
            return res.status(200).json({
                data: exchange.currencies.map((c: any) => ({
                    network: c.network,
                    asset: c.asset,
                })),
            });
        } else if (network) {
            return res.status(200).json({
                data: network.currencies.map((c: any) => ({
                    network: network.internal_name,
                    asset: c.asset,
                })),
            });
        } else {
            // If neither exchange nor network is found
            return res.status(200).json({ data: [] });
        }
    } catch (error) {
        console.error("Error in fetching source currencies", error);
        res.status(500).json({ data: error.message });
    }
}
