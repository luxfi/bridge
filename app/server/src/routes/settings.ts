//import { handlerGetExplorer, handlerGetHasBySwaps } from "@/helpers/swapHelper"
import { Router, Request, Response } from "express"

import { mainnetSettings, testnetSettings } from "@/settings"

const router: Router = Router()

// route: /api/settings/
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {

    const version = req.params.version
    const settings = version === "mainnet" ? mainnetSettings : testnetSettings;

    res.status(200).json({ ...settings.data })
  } 
  catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})

export default router
