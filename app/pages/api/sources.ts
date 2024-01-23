import type { NextApiRequest, NextApiResponse } from 'next'
import { mainnetSettings, testnetSettings } from '../../settings'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<typeof mainnetSettings | typeof testnetSettings>
) {
  const versionFromQuery = req.query.version as string;
  const isMainnet = versionFromQuery === 'mainnet' || process.env.NEXT_PUBLIC_API_VERSION === 'mainnet';
  const settings = isMainnet ? mainnetSettings : testnetSettings;

  res.status(200).json(settings);
}
