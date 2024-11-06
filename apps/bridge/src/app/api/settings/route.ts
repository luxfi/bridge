import type { NextRequest } from 'next/server';
import { mainnetSettings, testnetSettings } from "@/settings";

export async function GET (
  req: NextRequest,
) {
  // const versionFromQuery = req.query.version as string;
  // const isMainnet =
  //   versionFromQuery === "mainnet" ||
  //   process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
  // const settings = isMainnet ? mainnetSettings : testnetSettings;

  return Response.json(mainnetSettings, {status: 200})
}
