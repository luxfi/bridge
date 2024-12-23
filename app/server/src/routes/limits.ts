import { Router, Request, Response } from "express"
import { getLimits } from "@/domain/limits"

const router: Router = Router()

// route: api/limits/from/:fromAsset/to/:toAsset?version=
// description:
// method: GET and it's public
router.get(
  "/from/:fromAsset/to/:toAsset", 
  async (req: Request, res: Response) => {
    try {
      const { fromAsset, toAsset } = req.params
      const version = req.query.version

      res.status(200).json({
        data: getLimits(fromAsset, toAsset, version as 'testnet' | 'mainnet' | undefined)
      })
    } catch (error: any) {
      res.status(500).json({ error: error })
    }
  }
)

export default router
