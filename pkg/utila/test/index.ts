import { createGrpcClient, serviceAccountAuthStrategy } from "@/index";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";

const filePath = path.join(
  os.homedir(),
  ".config",
  "utila",
  "credentials",
  "lux-bridge@vault-11b8bd854f3e.utilaserviceaccount.io",
  "private_key.pem"
);

export const client = createGrpcClient({
  authStrategy: serviceAccountAuthStrategy({
    email: "lux-bridge@vault-11b8bd854f3e.utilaserviceaccount.io",
    privateKey: () =>
      readFile(filePath, {
        encoding: "utf-8",
      }),
  }),
}).version("v1alpha2");

const vaults = await client.listVaults({});
console.log(vaults);
