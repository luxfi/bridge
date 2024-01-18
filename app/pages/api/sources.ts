import type { NextApiRequest, NextApiResponse } from 'next'
import { mainnetSources, testnetSources } from '../../sources'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<typeof mainnetSources | typeof testnetSources>
) {
  const versionFromQuery = req.query.version as string;
  const isMainnet = versionFromQuery === 'mainnet' || process.env.NEXT_PUBLIC_API_VERSION === 'mainnet';
  const sources = isMainnet ? mainnetSources : testnetSources;

  res.status(200).json(sources);
}
