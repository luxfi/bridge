import express, { Request, Response, NextFunction } from "express"

const hashRegExp = /^(?=.{66}$)((^[0-9]+[a-z]+)|(^[a-z]+[0-9]+))+[0-9a-z]+$/i
/**
 * validate signData from frontend
 * @param req
 * @param res
 * @param next
 * @returns
 */
export const signDataValidator = (req: Request, res: Response, next: NextFunction) => {
  const { txId, fromNetworkId, toNetworkId, toTokenAddress, receiverAddressHash, msgSignature, nonce } = req.body

  if (!txId || !txId?.match(hashRegExp)) {
    const output = {
      status: false,
      msg: "NullTransactionError: bad transaction txId"
    }
    res.json(output)
    return
  }

  if (!fromNetworkId) {
    const output = {
      status: false,
      msg: "NullfromNetworkIdError: No fromNetworkId sent."
    }
    res.json(output)
    return
  }

  if (!toNetworkId) {
    const output = {
      status: false,
      msg: "NulltoNetworkIdError: No toNetworkId sent."
    }
    res.json(output)
    return
  }

  if (!toTokenAddress) {
    const output = {
      status: false,
      msg: "NulltoTokenAddressHashError: No toToken Address sent."
    }
    res.json(output)
    return
  }

  if (!receiverAddressHash) {
    const output = {
      status: false,
      msg: "NullreceiverAddressHashError: No receiver 's Address Hash sent."
    }
    res.json(output)
    return
  }

  if (!msgSignature) {
    const output = {
      status: false,
      msg: "NullMessageSignatureError: Challenge message signature not sent."
    }
    res.json(output)
    return
  }

  if (!nonce) {
    const output = {
      status: false,
      msg: "NullNonceError: No nonce sent."
    }
    res.json(output)
    return
  }
  next()
}
