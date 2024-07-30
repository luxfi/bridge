import { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/db";
import {
    deposit_addresses,
} from "../../../../settings";

/**
 * update deposit addresses of DB from setting file
 * 
 * @param req 
 * @param res 
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    Object.entries(deposit_addresses).map(async ([key, addresses]) => {
        await prisma.depositAddress.createMany({
            data: addresses.map((a: string) => ({
                address: a,
                type: key
            }))
        })
    });
    res.status(200).json({ status: 'success' });
}

