import { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/db";
import { NetworkType } from "../../../Models/CryptoNetwork";

function getRandomInt(a: number, b: number) {
    return Math.floor(Math.random() * (b - a + 1) + a);
}

/**
 * return deposit addresses across all chains
 * api/deposit_addresses
 * 
 * @param req { network }
 * @param res { type: string, address: string }
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Get dynamic id from URL
    const { network } = req.query;
    // Get version from query parameter
    const { version } = req.query;
    const isMainnet =
        version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    // settings

    const data = {};
    const types = await prisma.depositAddress.groupBy({
        by: ['type']
    });
    for (let index = 0; index < types.length; index++) {
        const el = types[index];
        const _data = await prisma.depositAddress.findMany({
            where: { type: el.type },
            select: {
                address: true
            }
        });
        data[el.type] = _data.map(_d => _d.address);
    }
    res.status(200).json({
        data
    });
}

