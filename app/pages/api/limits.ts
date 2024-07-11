import type { NextApiRequest, NextApiResponse } from 'next'
import { mainnetSettings, testnetSettings } from '../../settings'

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const versionFromQuery = req.query.version as string;
    const isMainnet = versionFromQuery === 'mainnet' || process.env.NEXT_PUBLIC_API_VERSION === 'mainnet';
    // const settings = isMainnet ? mainnetSettings : testnetSettings;
    const settings = testnetSettings;

    res.status(200).json({
        data: {
            "min_amount_in_usd": 0,
            "min_amount": 0,
            "max_amount_in_usd": 0,
            "max_amount": 0
        }
    });
}
