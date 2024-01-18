import type { NextApiRequest, NextApiResponse } from 'next'
import { mainnetDestinations, testnetDestinations } from '../../destinations'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<typeof mainnetDestinations | typeof testnetDestinations>
) {
  const versionFromQuery = req.query.version as string;
  const isMainnet = versionFromQuery === 'mainnet' || process.env.NEXT_PUBLIC_API_VERSION === 'mainnet';
  const destinations = isMainnet ? mainnetDestinations : testnetDestinations;

  res.status(200).json(destinations);
}
