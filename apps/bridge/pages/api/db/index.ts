import type { NextApiRequest, NextApiResponse } from "next";
import { CryptoNetwork } from "../../../Models/CryptoNetwork";
import { PrismaClient } from "@prisma/client";
import { tmpdir } from "os";
import fs from "fs";

const writeDecodedFile = (filename: string, base64Content: string) => {
  const filePath = `${tmpdir()}/${filename}`;
  const contentBuffer = Buffer.from(base64Content, "base64");
  console.log(filePath);

  fs.writeFile(filePath, contentBuffer, (err) => {
    if (err) {
      console.log(`Error writing ${filename}:`, err);
    } else {
      console.log(`${filename} successfully written to temp directory`);
    }
  });
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{
    data: CryptoNetwork[] | any;
  }>
) {
  try {
    if (process.env.CLIENT_CERT_BASE64) {
      writeDecodedFile("client-cert.pem", process.env.CLIENT_CERT_BASE64);
    } else {
      console.log(
        `${process.env.CLIENT_CERT_BASE64} environment variable is not set.`
      );
    }
    // Decode and write client-key.pem
    if (process.env.CLIENT_KEY_BASE64) {
      writeDecodedFile("client-key.pem", process.env.CLIENT_KEY_BASE64);
    } else {
      console.log(
        `${process.env.CLIENT_KEY_BASE64} environment variable is not set.`
      );
    }
    // Decode and write server-ca.pem
    if (process.env.SERVER_CA_BASE64) {
      writeDecodedFile("server-ca.pem", process.env.SERVER_CA_BASE64);
    } else {
      console.log(
        `${process.env.SERVER_CA_BASE64} environment variable is not set.`
      );
    }

    const prisma = new PrismaClient();

    res.status(200).json({
      data: {
        "client-cert.pem": "client-cert.pem",
        "client-key.pem": "client-key.pem",
        "server-ca.pem": "server-ca.pem",
        keys: Object.keys(prisma),
      },
    });
  } catch (error) {
    console.error("Error in fetching networks", error);
    res.status(500).json({ data: error.message });
  }
}
