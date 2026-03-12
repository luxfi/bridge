import { Router, Request, Response } from "express"
import { getSettings, type NetworkVersion } from "@/domain/settings"

const router: Router = Router()

// route: /api/settings/
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {
    const { version } = req.query
    const settings = getSettings((version as NetworkVersion) ?? 'mainnet')
    res.status(200).json({ ...settings.data })
  } 
  catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})

export default router
