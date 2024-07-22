import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../settings";
import { Exchange } from "../../Models/Exchange";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<{
        data: Exchange[];
    }>
) {
    try {
        const { version } = req.query;
        const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
        // settings
        const settings = isMainnet ? mainnetSettings : testnetSettings;
        const { exchanges } = settings.data;
        return exchanges;
    } catch (error) {
        console.error("Error in fetching exchanges", error);
        res.status(500).json({ data: error.message });
    }
}
