import { Router, Request, Response } from "express"
import { getTokenPrice } from "@/lib/tokens"

const router: Router = Router()

// route: api/limits/from/fromCurrency/to/toCurrency?version=
// description:
// method: GET and it's public
router.get("/from/:fromCurrency/to/:toCurrency", async (req: Request, res: Response) => {
  try {
    // Access the route parameters
    const { fromCurrency, toCurrency } = req.params
    // Access the query parameter
    const version = req.query.version

    res.status(200).json({
      data: {
        manual_min_amount: 0.1,
        manual_min_amount_in_usd: 0,
        max_amount: 100,
        max_amount_in_usd: 0,
        wallet_min_amount: 0,
        wallet_min_amount_in_usd: 0
      }
    })
  } catch (error: any) {
    res.status(500).json({ error: error })
  }
})

export default router
