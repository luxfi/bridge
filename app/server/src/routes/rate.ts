import { Router, Request, Response } from "express"
import { getRate } from "@/domain/rate"

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
    } = req.params;

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
    res.status(500).json({ error: error })
  }
})

export default router
