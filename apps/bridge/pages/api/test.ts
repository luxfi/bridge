import type { NextApiRequest, NextApiResponse } from "next";
import { mainnetSettings, testnetSettings } from "../../settings";
import { CryptoNetwork } from "../../Models/CryptoNetwork";
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

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<{
        data: CryptoNetwork[] | any;
    }>
) {
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
