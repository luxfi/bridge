import { getSigFromMpcOracleNetwork } from "@/helpers/mpcHelper"
import { Router, Request, Response } from "express"
import { handleSwapCreation, handlerGetSwap, handlerGetSwaps, handlerUpdateMpcSignAction, handlerUpdatePayoutAction, handlerUpdateUserTransferAction } from "@/helpers/swapHelper"

import { check, validationResult, ValidationError, Result } from "express-validator"

const router: Router = Router()

// route: /api/swaps
// description: get swaps
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {
    const isDeleted = (req.query.isDeleted && Boolean(Number(req.query.isDeleted))) || undefined
    const result = await handlerGetSwaps(req.query.address as string, isDeleted)
    res.status(200).json({ data: result })
  } catch (error) {
    res.status(500).json({ error: error?.message })
  }
})
// route: /api/swaps/:id
// description: get swap
// method: GET and it's public
router.get("/:swapId", async (req: Request, res: Response) => {
  try {
    const swapId = req.params.swapId
    console.log({ swapId })
    const result = await handlerGetSwap(swapId as string)
    res.status(200).json({ data: result })
  } catch (error) {
    res.status(500).json({ error: error?.message })
  }
})
// route: /api/swaps
// description: create swap
// method: POST and it's public
router.post(
  "/",
  [
    check("amount", "amount is required").notEmpty(),
    check("source_network", "source_network is required").notEmpty(),
    check("destination_network", "destination_network is required").notEmpty(),
    check("destination_asset", "destination_asset is required").notEmpty(),
    check("destination_address", "destination_address is required").notEmpty(),
    check("use_deposit_address", "use_deposit_address is required").notEmpty(),
    check("use_teleporter", "use_teleporter is required").notEmpty(),
    check("app_name", "app_name is required").notEmpty()
  ],
  async (req: Request, res: Response) => {
    const errors: Result<ValidationError> = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    try {
      const result = await handleSwapCreation({
        ...req.body
      })
      res.status(200).json({ data: { ...result } })
    } catch (error) {
      console.log(error)
      res.status(500).json({ error: error?.message })
    }
  }
)
// route: /api/swaps/transfer/:id
// description: update transfer action
// method: GET and it's public
router.post(
  "/transfer/:swapId",
  [check("txHash", "txHash is required").notEmpty(), check("amount", "amount is required").notEmpty(), check("from", "from is required").notEmpty(), check("to", "to is required").notEmpty()],
  async (req: Request, res: Response) => {
    try {
      const errors: Result<ValidationError> = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }
      const swapId = req.params.swapId
      const { txHash, amount, from, to } = req.body
      const result = await handlerUpdateUserTransferAction(swapId as string, txHash, Number(amount), from, to)
      res.status(200).json({ data: result })
    } catch (error) {
      res.status(500).json({ error: error?.message })
    }
  }
)
// route: /api/swaps/payout/:id
// description: update payout action
// method: GET and it's public
router.post(
  "/payout/:swapId",
  [check("txHash", "txHash is required").notEmpty(), check("amount", "amount is required").notEmpty(), check("from", "from is required").notEmpty(), check("to", "to is required").notEmpty()],
  async (req: Request, res: Response) => {
    try {
      const errors: Result<ValidationError> = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }
      const swapId = req.params.swapId
      const { txHash, amount, from, to } = req.body
      const result = await handlerUpdatePayoutAction(swapId as string, txHash, Number(amount), from, to)
      res.status(200).json({ data: result })
    } catch (error) {
      res.status(500).json({ error: error?.message })
    }
  }
)
// route: /api/swaps/mpcsign/:id
// description: update mpc
// method: GET and it's public
router.post(
  "/mpcsign/:swapId",
  [check("txHash", "txHash is required").notEmpty(), check("amount", "amount is required").notEmpty(), check("from", "from is required").notEmpty(), check("to", "to is required").notEmpty()],
  async (req: Request, res: Response) => {
    try {
      const errors: Result<ValidationError> = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }
      const swapId = req.params.swapId
      const { txHash, amount, from, to } = req.body
      const result = await handlerUpdateMpcSignAction(swapId as string, txHash, Number(amount), from, to)
      res.status(200).json({ data: result })
    } catch (error) {
      res.status(500).json({ error: error?.message })
    }
  }
)

// route: /api/swaps/getsig
// description: update mpc
// method: GET and it's public
router.post(
  "/getsig",
  [
    check("txId", "txId is required").notEmpty(),
    check("fromNetworkId", "fromNetworkId is required").notEmpty(),
    check("toNetworkId", "toNetworkId is required").notEmpty(),
    check("toTokenAddress", "toTokenAddress is required").notEmpty(),
    check("msgSignature", "msgSignature is required").notEmpty(),
    check("receiverAddressHash", "receiverAddressHash is required").notEmpty()
  ],
  async (req: Request, res: Response) => {
    try {
      const { txId, fromNetworkId, toNetworkId, toTokenAddress, msgSignature, receiverAddressHash } = req.body

      const signData = {
        txId,
        fromNetworkId: String(fromNetworkId),
        toNetworkId: String(toNetworkId),
        toTokenAddress,
        msgSignature,
        receiverAddressHash,
        nonce: 0x0002
      }
      const data = await getSigFromMpcOracleNetwork(signData)
      console.log("::mpc sign data", data)
      res.status(200).json(data)
    } catch (err) {
      console.log(err)
      res.status(500).json("error in generating from mpc oracle network...")
    }
  }
)

export default router
