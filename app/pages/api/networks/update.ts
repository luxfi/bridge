import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../../settings";
import prisma from "../../../lib/db";
import { tmpdir } from 'os';
import fs from 'fs';

const writeDecodedFile = (filename: string, base64Content: string) => {
    const filePath = `${tmpdir()}/${filename}`;
    const contentBuffer = Buffer.from(base64Content, 'base64');
    console.log(filePath)

    fs.writeFile(filePath, contentBuffer, (err) => {
        if (err) {
            console.log(`Error writing ${filename}:`, err);
        } else {
            console.log(`${filename} successfully written to temp directory`);
        }
    });
}
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
    // try {
    //     const { version } = req.query;
    //     const isMainnet = version === "mainnet" || process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
    //     // settings
    //     const settings = isMainnet ? mainnetSettings : testnetSettings;
    //     const { networks } = settings.data;
    //     await prisma.quote.deleteMany({});
    //     console.log("deleted quote...")
    //     await prisma.depositAction.deleteMany({});
    //     console.log("deleted depositAction...")
    //     await prisma.currency.deleteMany({});
    //     console.log("deleted currency...")
    //     await prisma.rpcNode.deleteMany({});
    //     console.log("deleted rpcNode...")
    //     await prisma.network.deleteMany({});
    //     console.log("deleted network...")
    //     for (let index = 0; index < networks.length; index++) {
    //         const n = networks[index];
    //         const _network = await prisma.network.create({
    //             data: {
    //                 display_name: n.display_name,
    //                 internal_name: n.internal_name,
    //                 native_currency: n.native_currency,
    //                 is_testnet: n.is_testnet,
    //                 is_featured: n.is_featured,
    //                 chain_id: n.chain_id,
    //                 type: n.type,
    //                 average_completion_time: n.average_completion_time,
    //                 transaction_explorer_template: n.transaction_explorer_template,
    //                 account_explorer_template: n.account_explorer_template,
    //             }
    //         });
    //         await prisma.rpcNode.createMany({
    //             data: n.nodes.map((n: any) => ({
    //                 network_id: _network.id,
    //                 url: n.url
    //             }))
    //         })
    //         await prisma.currency.createMany({
    //             data: n.currencies.map((c: any) => ({
    //                 network_id: _network.id,
    //                 name: c.asset,
    //                 asset: c.asset,
    //                 contract_address: c.contract_address,
    //                 decimals: c.decimals,
    //                 price_in_usd: c.price_in_usd,
    //                 precision: c.precision,
    //                 is_native: c.is_native,
    //             }))
    //         })
    //     }
    //     return res.status(200).json(
    //         {
    //             status: "success"
    //         }
    //     )
    // } catch (error) {
    //     console.error("Error in updating networks", error);
    //     res.status(500).json({ data: error.message });
    // }
    try {
        if (process.env.NEXT_PUBLIC_NODE_ENV === "production") {
            // Decode and write client-cert.pem
            if (process.env.CLIENT_CERT_BASE64) {
                writeDecodedFile('client-cert.pem', process.env.CLIENT_CERT_BASE64);
            } else {
                console.log(`${process.env.CLIENT_CERT_BASE64} environment variable is not set.`);
            }
            // Decode and write client-key.pem
            if (process.env.CLIENT_KEY_BASE64) {
                writeDecodedFile('client-key.pem', process.env.CLIENT_KEY_BASE64);
            } else {
                console.log(`${process.env.CLIENT_KEY_BASE64} environment variable is not set.`);
            }
            // Decode and write server-ca.pem
            if (process.env.SERVER_CA_BASE64) {
                writeDecodedFile('server-ca.pem', process.env.SERVER_CA_BASE64);
            } else {
                console.log(`${process.env.SERVER_CA_BASE64} environment variable is not set.`);
            }
            // globalThis.prismaGlobal = prisma;
        } else {
            // globalThis.prismaGlobal = prisma;
        }
        res.status(500).json({
            data: { aa: `${tmpdir()}/${process.env.SERVER_CA_BASE64}`, aaa: `${tmpdir()}/${process.env.CLIENT_KEY_BASE64f}`, aaaa: `${tmpdir()}/${process.env.CLIENT_CERT_BASE64}` }
        });
    } catch (error) {
        console.error("Error in fetching networks", error);
        res.status(500).json({
            data: { err: String(error), aa: `${tmpdir()}/${process.env.SERVER_CA_BASE64}`, aaa: `${tmpdir()}/${process.env.CLIENT_KEY_BASE64f}`, aaaa: `${tmpdir()}/${process.env.CLIENT_CERT_BASE64}` }
        });
    }
}
