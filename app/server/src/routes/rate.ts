import { Router, Request, Response } from "express"
import { getRate } from "@/domain/rate"
import { UnsupportedPair, UnknownPrice } from "@/domain/quote"

const router: Router = Router()

// route: api/rate/:source_network/:source_asset/:destination_network/:destination_asset?amount=&version=
// description:
// method: GET and it's public
router.get(
  "/:source_network/:source_asset/:destination_network/:destination_asset", 
  async (req: Request, res: Response) => {

  try {
    const {
      source_network,
      source_asset,
      destination_network,
      destination_asset
    } = req.params as {
      source_network: string
      source_asset: string
      destination_network: string
      destination_asset: string
    };

    const {
      amount,
      version
    } = req.query

    const _version = version ?? 'mainnet'

    const result = await getRate(
      source_network, 
      source_asset, 
      destination_network, 
      destination_asset,
      Number(amount),
      _version as 'mainnet' | 'testnet'
    )

    res.status(200).json({ data: result})
  }
  catch (error: any) {
    if (error instanceof UnsupportedPair || error instanceof RangeError) {
      return res.status(400).json({ error: error.message })
    }
    if (error instanceof UnknownPrice) {
      return res.status(503).json({ error: error.message })
    }
    res.status(500).json({ error: error?.message })
  }
})

export default router
