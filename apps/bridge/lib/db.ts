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

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (!globalThis.prismaGlobal) {
  // Decode and write client-cert.pem
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
  globalThis.prismaGlobal = prisma;
} else {
  globalThis.prismaGlobal = prisma;
}

export default globalThis.prismaGlobal;
