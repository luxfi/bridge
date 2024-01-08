import type { NextApiRequest, NextApiResponse } from 'next'
import { mainnetSettings, testnetSettings } from '../../settings'

type ResponseData = {
  message: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === 'mainnet';
  const settings = isMainnet ? mainnetSettings : testnetSettings;
  res.status(200).json(settings)
}
