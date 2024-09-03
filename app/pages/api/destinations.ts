import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../settings";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<{
        data: {
            network: string;
            asset: string;
        }[];
    }>
) {
    try {
        const {
            source_asset_group,
            source_network,
            source_asset,
            version
        } = req.query;
        const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
        // settings
        const settings = isMainnet ? mainnetSettings : testnetSettings;
        const { networks, exchanges } = settings.data;

        if (source_network === 'LUX_MAINNET') {
            return res.status(200).json({
                data: [
                    {
                        network: 'LUXUSA',
                        asset: 'LUX'
                    },
                    {
                        network: 'LUXLINK',
                        asset: 'LUX'
                    },
                ]
            });
        } else if (source_network || source_asset_group) {
            return res.status(200).json({
                data: [
                    {
                        network: 'LUX_MAINNET',
                        asset: 'LUX'
                    }
                ]
            });
        } else {
            return res.status(200).json({
                data: [
                    {
                        network: 'LUXUSA',
                        asset: 'LUX'
                    },
                    {
                        network: 'LUXLINK',
                        asset: 'LUX'
                    },
                    {
                        network: 'LUX_MAINNET',
                        asset: 'LUX'
                    }
                ]
            });
        }
    } catch (error) {
        console.error("Error in fetching destinations", error);
        res.status(500).json({ data: error.message });
    }
}
