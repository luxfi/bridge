import { Router, Request, Response } from "express"

import { getNetworks } from "@/domain/networks"
import { type NetworkVersion } from "@/domain/settings"

const router: Router = Router()

// route: /api/networks/
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {

    const version = req.query.version ?? req.params.version
    const _version = (version as string) ?? 'mainnet'

    res.status(200).json({ data: getNetworks((_version as NetworkVersion) ?? 'mainnet') })
  } 
  catch (error: any) {
    res.status(500).json({ error: error })
  }
})

export default router
