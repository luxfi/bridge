import { getExplorer, getHasBySwaps } from "@/domain/explorer"
import { Router, Request, Response } from "express"

const router: Router = Router()

// route: /api/explorer/
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get dynamic id from URL
    // const { statuses } = req.query
    // // Get version from query parameter
    // const version = req.query.version
    const statuses: string[] = []
    const result = await getExplorer(statuses)
    console.log("🚀 ~ result:", result)
    res.status(200).json({ data: result })
  } catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})
// route: /api/explorer/:transaction_has
// description:
// method: GET and it's public
router.get("/:transaction_has", async (req: Request, res: Response) => {
  try {
    const transaction_has = req.params.transaction_has
    const result = await getHasBySwaps(transaction_has)
    console.log("🚀 ~ result:", result)
    res.status(200).json({ data: result })
  } 
  catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})

export default router
