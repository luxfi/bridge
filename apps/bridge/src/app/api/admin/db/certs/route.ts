import { NextRequest, NextResponse } from 'next/server';
import { type CryptoNetwork } from "@/Models/CryptoNetwork";
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

export async function POST (
  req: NextRequest,
) {
  try {
    if (process.env.CLIENT_CERT_BASE64) {
      writeDecodedFile("client-cert.pem", process.env.CLIENT_CERT_BASE64);
    } 
    else {
      console.log( 'CLIENT_CERT_BASE64 environment variable is not set.')
    }
    // Decode and write client-key.pem
    if (process.env.CLIENT_KEY_BASE64) {
      writeDecodedFile("client-key.pem", process.env.CLIENT_KEY_BASE64);
    } 
    else {
      console.log( 'CLIENT_KEY_BASE64 environment variable is not set.' )
    }
    // Decode and write server-ca.pem
    if (process.env.SERVER_CA_BASE64) {
      writeDecodedFile("server-ca.pem", process.env.SERVER_CA_BASE64);
    } 
    else {
      console.log( 'SERVER_CA_BASE64 environment variable is not set.' )
    }

    const prisma = new PrismaClient();

    return NextResponse.json(
      { data: {
          "client-cert.pem": "client-cert.pem",
          "client-key.pem": "client-key.pem",
          "server-ca.pem": "server-ca.pem",
          keys: Object.keys(prisma),
        },
      }, 
      {
        status: 200
      }
    )
  } 
  catch (error: any) {
    console.error("Error in fetching networks", error);
    return Response.json({
      error: error.message ?? "Error in fetching networks"
    }, {
      status: 500, statusText: error.message ?? "Error in fetching networks"
    })
  }
}
