import { Router, Request, Response } from "express"
import { getTokenPrice } from "@/lib/tokens"

const router: Router = Router()

// route: /rate/source_network/source_asset/destination_network/destination_asset?amount=&version=
// description:
// method: GET and it's public
router.get("/:source_network/:source_asset/:destination_network/:destination_asset", async (req: Request, res: Response) => {
  try {
    // Access the route parameters
    const { source_network, source_asset, destination_network, destination_asset } = req.params;

    // Access the query parameters
    const amount = req.query.amount;
    const version = req.query.version;

    const [sourcePrice, destinationPrice] = await Promise.all([
        getTokenPrice(source_asset),
        getTokenPrice(destination_asset)
    ]);

    res.status(200).json({
      data: {
          wallet_fee_in_usd: 10,
          wallet_fee: 0.1,
          wallet_receive_amount: Number(amount),
          manual_fee_in_usd: 0,
          manual_fee: 0,
          manual_receive_amount: Number(amount) * sourcePrice / destinationPrice,
          avg_completion_time: {
              total_minutes: 2,
              total_seconds: 0,
              total_hours: 0,
          },
          fee_usd_price: 10,
      }
  })
  } catch (error: any) {
    res.status(500).json({ error: error })
  }
})

export default router
