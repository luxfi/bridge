import { Router, Request, Response } from "express"
import { getQuote } from "@/domain/quote"

const router: Router = Router()

// route: api/quote?source_network=ETHEREUM_SEPOLIA&source_token=USDC&destination_network=ARBITRUM_SEPOLIA&destination_token=USDC&amount=1.245766&refuel=false&use_deposit_address=false
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {
    const { 
      source_network, 
      source_token, 
      destination_network, 
      destination_token, 
      amount, 
      refuel, 
      use_deposit_address 
    } = req.query

    const result = await getQuote(
      ((source_network ?? '') as string),
      ((source_token ?? '') as string),
      ((destination_network ?? '') as string),
      ((destination_token ?? '') as string),
      Number(amount),
      Number(refuel),
      ((use_deposit_address ?? '') as string),
    )

    res.status(200).json({ data: result})
  } 
  catch (error: any) {
    res.status(500).json({ error: error })
  }
})

export default router
