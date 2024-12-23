import { Router, Request, Response } from "express"
import { getTokenPrice } from "@/domain/tokens";

const router: Router = Router()

// route: /api/tokens/price/:token_id
// description:
// method: GET and it's public
router.get("/price/:token_id", async (req: Request, res: Response) => {
  try {
    const token_id = req.params.token_id
    const price = await getTokenPrice(token_id)
    res.status(200).json({ data: {
      asset: token_id,
      price
    }})
  } 
  catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})


export default router
