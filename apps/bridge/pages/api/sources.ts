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
        const {
            destination_asset_group,
            destination_network,
            destination_asset,
            version
        } = req.query;
        const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
        // settings
        const settings = isMainnet ? mainnetSettings : testnetSettings;
        const { networks, exchanges } = settings.data;

        if (destination_asset_group) {
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
                    ...networks.map((n: any) => ({
                        network: n?.internal_name,
                        asset: n?.native_currency
                    })),
                    ...exchanges.map((e: any) => ({
                        network: e?.internal_name,
                        asset: e?.display_name
                    })),
                ],
            });
        }
    } catch (error) {
        console.error("Error in fetching destinations", error);
        res.status(500).json({ data: error.message });
    }
}
