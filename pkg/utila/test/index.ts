import { createGrpcClient, serviceAccountAuthStrategy } from "@/index";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";

const filePath = path.join(
  os.homedir(),
  ".config",
  "utila",
  "credentials",
  "netanelprod@vault-76ce849bc0f8.utilaserviceaccount.io",
  "private_key.pem"
);

export const client = createGrpcClient({
  authStrategy: serviceAccountAuthStrategy({
    email: "netanelprod@vault-76ce849bc0f8.utilaserviceaccount.io",
    privateKey: () =>
      readFile(filePath, {
        encoding: "utf-8",
      }),
  }),
}).version("v1alpha2");

const vaults = await client.listVaults({});
console.log(vaults);
