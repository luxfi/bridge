import axios from 'axios'

import type { Asset } from '@luxfi/core'

const getAssetPrice = async (a: Asset): Promise<number | undefined> => {

  const { data } = await axios.get(
    import.meta.env.VITE_SERVER_URI + '/api/tokens/price/' + a.asset
  )
  return data?.data?.price ? Number(data?.data?.price) : undefined
}

export default getAssetPrice
