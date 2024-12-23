import { Router, Request, Response } from "express"

import { getNetworks } from "@/domain/networks"

const router: Router = Router()

// route: /api/networks/
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {

    const { version }  = req.params
    const _version = version ?? 'mainnet'

    res.status(200).json({ data: getNetworks(_version as 'mainnet' | 'testnet') })
  } 
  catch (error: any) {
    res.status(500).json({ error: error })
  }
})

export default router
