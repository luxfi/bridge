//import { handlerGetExplorer, handlerGetHasBySwaps } from "@/helpers/swapHelper"
import { Router, Request, Response } from "express"

import { mainnetSettings, testnetSettings } from "@/settings"

const router: Router = Router()

// route: /api/networks/
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {

    const version = req.params.version
    const isMainnet = version ? (version === "mainnet") : true
    const settings = isMainnet ? mainnetSettings : testnetSettings;

    res.status(200).json({ data: settings.data.networks })
  } 
  catch (error: any) {
    res.status(500).json({ error: error })
  }
})


export default router
