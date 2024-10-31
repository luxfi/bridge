/*
 * Teleport Bridge
 * Copyright (c) Artrepreneur1
 * Use of this source code is governed by an MIT
 * license that can be found in the LICENSE file.
 * This is an implementation of a privacy bridging node.
 * Currently, utilizes ECDSA Signatures to validate burning or vaulting of assets.
 * Signatures allow minting to occur cross chain.
 */
import cors from "cors"
import express, { Request, Response } from "express"
import Web3 from "web3"
import { Interface } from "ethers"
import { settings } from "./config"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"
import { PrismaClient } from "@prisma/client"
import { signDataValidator } from "./validator"
import { MAIN_NETWORKS, SWAP_PAIRS, TEST_NETWORKS } from "./config/settings"
import { getWeb3FormForRPC, hashAndSignTx } from "./utils"

const prisma = new PrismaClient()

/* Settings Mapping */
const settingsMap = new Map()

for (const [key, value] of Object.entries(settings)) {
  //Stucture: settingsMap.set("someLuxCoin", {chain1:"", ..., chainN: ""})
  settingsMap.set(key, value)
}

/* Signing MSG */
const msg = settings.Msg //signing msg used in front running prevention
/* Dupelist - a graylist for slowing flood attack */
let dupeStart = 0
const dupeListLimit = Number(settings.DupeListLimit)
let dupeList = new Map()

const app = express()
app.use(express.json())
app.use(cors())
app.use(express.urlencoded({ extended: true }))

const port = process.env.PORT || 6000 //6000
const server = app.listen(Number(port), "0.0.0.0", function () {
  console.log(`>> Teleporter_${process.env.node_number} Running At: ${port}`)
})

app.get("/", async (req: Request, res: Response) => {
  res.send(`>>> node_${process.env.node_number} is running at: ${port}`)
})

app.get("/dbcheck", async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.teleporter.findMany()
    res.status(200).json(transactions)
  } catch (err) {
    console.log("Failed to save tx to db", err)
    res.status(500).json(err)
  }
})

app.get("/networks", async (req: Request, res: Response) => {
  try {
    const nettowks = {
      mainnets: MAIN_NETWORKS,
      testnets: TEST_NETWORKS
    }
    res.status(200).json(nettowks)
  } catch (err) {
    console.log("Failed to save tx to db", err)
    res.status(500).json(err)
  }
})

/*
 * Given parameters associated with the token burn, we validate and produce a signature entitling user to payout.
 * Parameters specific to where funds are being moved / minted to, are hashed, such that only the user has knowledge of
 * mint destination. Effectively, the transaction is teleported stealthily.
 */
app.post("/api/v1/generate_mpc_sig", signDataValidator, async (req: Request, res: Response) => {
  // Checking inputs
  const stealthMode = true // Stealth overrride by default, for now.

  let { txId, fromNetworkId, toNetworkId, toTokenAddress, receiverAddressHash, msgSignature, nonce } = req.body

  console.log(typeof fromNetworkId)
  // Dupelist reset if time has elapsed.
  const dupeStop = new Date() //time now
  if ((Number(dupeStop) - dupeStart) / 1000 >= 2400) {
    dupeList = new Map() //Clear dupeList
    dupeStart = new Date().getTime()
  }

  // Limit on checks here, else you go into graylist.
  if (dupeList.get(txId.toString()) == undefined) {
    //First time
    dupeList.set(txId.toString(), 0) // init
  } else {
    if (dupeList.get(txId.toString()) >= dupeListLimit) {
      // temp blacklist - pm2 cron will reset graylist after 12hrs
      console.log("Dupe transaction request limit hit")
      const output = {
        status: false,
        msg: "DupeTransactionError: Too many transaction requests. Try back later."
      }
      res.json(output)
      return
    }
    dupeList.set(txId.toString(), dupeList.get(txId.toString()) + 1)
  }

  const toTokenAddressHash = Web3.utils.keccak256(toTokenAddress) // hash the destination token address
  const hashedTxId = Web3.utils.soliditySha3(txId)

  // check replay attack
  const { status, data } = await checkStealthSignature(hashedTxId)
  if (status) {
    const output = {
      status: false,
      msg: "DuplicatedTxHashError: TxHash already exists."
    }
    res.json(output)
    return
  }

  const txidNonce = stealthMode ? hashedTxId + nonce : txId + nonce
  const txStub = stealthMode ? hashedTxId : txId

  // console.log("txidNonce:", txidNonce)

  const fromNetwork = MAIN_NETWORKS.find((n) => n.chain_id === fromNetworkId) ?? TEST_NETWORKS.find((n) => n.chain_id === fromNetworkId)
  const toNetwork = MAIN_NETWORKS.find((n) => n.chain_id === toNetworkId) ?? TEST_NETWORKS.find((n) => n.chain_id === toNetworkId)
  if (!fromNetwork) {
    res.json({
      status: false,
      msg: `Unrecognized Source Network Error: Teleport does not support this network id ${fromNetworkId}.`
    })
    return
  } else if (!toNetwork) {
    res.json({
      status: false,
      msg: `Unrecognized Destination Network Error: Teleport does not support this network id ${toNetworkId}.`
    })
    return
  } else if (fromNetwork.is_testnet !== toNetwork.is_testnet) {
    res.json({
      status: false,
      msg: `Unmatched Network Type Error: Src and Dst chains' types are not matched.`
    })
    return
  }
  // get Web3Form using rpc url of specific network
  const web3Form = getWeb3FormForRPC(fromNetwork.node)
  if (!web3Form) {
    res.json({
      status: false,
      msg: `Web3 object build Error: Cannot setup web3 object for this network ${fromNetwork.node}.`
    })
    return
  }
  const fromBridgeAddress = fromNetwork.teleporter
  if (!fromBridgeAddress) {
    res.json({
      status: false,
      msg: `Null teleporter Error: Cannot find teleporter from this chain ${fromNetwork.chain_id}.`
    })
    return
  }

  // get transaction info according to chains
  const { status: txStatus, msg: txMsg, payload: txPayload } = await getEvmTransactionUsingTxId(txId, web3Form)

  if (!txStatus) {
    res.json({
      status: false,
      msg: `BadTransactionError: ${txMsg}`
    })
    return
  }

  console.log("::caught event:", txPayload)

  const { teleporter: fromBridgeAddressByTx, token: fromTokenAddress, from, eventName, value: tokenAmount } = txPayload

  const vault = eventName.toString() === "VaultDeposit" ? true : false

  // TODO: check bridge addresses
  if (fromBridgeAddress.toLowerCase() !== fromBridgeAddressByTx.toLowerCase()) {
    res.json({
      status: false,
      msg: `InvalidBridgeAddressError: ${fromBridgeAddressByTx} is not a vaild bridge address of chain ${fromNetworkId}`
    })
    return
  }
  // TODO: check swap possibility according to src & dst chains
  const fromToken = fromNetwork.currencies.find((c) => c.contract_address.toLowerCase() === fromTokenAddress.toLowerCase())
  const toToken = toNetwork.currencies.find((c) => c.contract_address.toLowerCase() === toTokenAddress.toLowerCase())
  // console.log("::tokens: ", { fromToken, toToken })

  if (!fromToken) {
    res.json({
      status: false,
      msg: `InvalidSrcTokenAddressError: ${fromTokenAddress} is not supported for current teleport`
    })
    return
  } else if (!toToken) {
    res.json({
      status: false,
      msg: `InvalidDstTokenAddressError: ${toTokenAddress} is not supported for current teleport`
    })
    return
  }

  if (!SWAP_PAIRS[fromToken.asset]?.includes(toToken.asset)) {
    res.json({
      status: false,
      msg: `InvalidTokenPairsToSwap: These tokens are not possible to swap each others`
    })
    return
  }

  //To prove user signed we recover signer for (msg, sig) using testSig which rtrns address which must == toTargetAddr or return error
  let signerAddress = ""
  try {
    signerAddress = web3Form.eth.accounts.recover(msg, msgSignature) //best  on server
  } catch (err) {
    const output = {
      status: false,
      msg: "SignerRecoverError: can not recover signer from msgSignature"
    }
    res.json(output)
    return
  }
  console.log("::signerAddress:", signerAddress.toString().toLowerCase(), "::From Address:", from.toString().toLowerCase())

  // Bad signer (test transaction signer must be same as burn transaction signer) => exit, front run attempt
  let signerOk = false
  if (signerAddress.toString().toLowerCase() !== from.toString().toLowerCase()) {
    console.log("*** Possible front run attempt, message signer not transaction sender ***")
    const output = {
      status: false,
      msg: "InvalidSenderError: Invalid Token Sender."
    }
    res.json(output)
    return
  } else {
    signerOk = true
  }

  // // If signerOk we use the receiverAddressHash provided, else we hash the from address.
  // receiverAddressHash = signerOk ? receiverAddressHash : Web3.utils.keccak256(from)

  try {
    const { signature, mpcSigner } = await hashAndSignTx({
      web3Form,
      toNetworkId,
      hashedTxId: hashedTxId,
      toTokenAddress: toToken.contract_address,
      tokenAmount: tokenAmount.toString(),
      decimals: fromToken.decimals,
      receiverAddressHash,
      nonce: txidNonce,
      vault
    })
    //NOTE: For private transactions, store only the sig.
    const output = {
      fromTokenAddress: fromTokenAddress,
      contract: fromNetwork.teleporter,
      from: from,
      tokenAmount: tokenAmount.toString(),
      signature: signature,
      mpcSigner: mpcSigner,
      hashedTxId: hashedTxId,
      toTokenAddressHash: toTokenAddressHash,
      vault: vault
    }
    await savehashedTxId({
      chainType: "evm",
      txId: txId,
      amount: tokenAmount.toString(),
      signature,
      hashedTxId: hashedTxId
    })
    res.status(200).json({
      status: true,
      data: output
    })
    return
  } catch (err) {
    let output: any
    if (err === "AlreadyMintedError") {
      console.log(err)
      output = { status: false, msg: err + " It appears these coins were already bridged." }
    } else if (err === "GasTooLowError") {
      console.log(err)
      output = { status: false, msg: err + " Try setting higher gas prices. Do you have enough tokens to pay for fees?" }
    } else {
      console.log(err)
      output = { status: false, msg: err }
    }
    res.json(output)
    return
  }
})

/**
 * check relay attack
 * @param hashedTxId
 * @returns object { status, data }
 */
const checkStealthSignature = async (hashedTxId: string) => {
  console.log("::Searching for txid:", hashedTxId)
  try {
    const data = await prisma.teleporter.findUnique({
      where: { hashedTxId: hashedTxId }
    })
    console.log("::Find Stealth Hash: ", data)
    if (data) {
      return Promise.resolve({ status: true, data: data })
    } else {
      // not a replay
      return Promise.resolve({ status: false, data })
    }
  } catch (err) {
    return Promise.resolve({ status: false, data: null })
  }
}

/**
 * save Tx info to db
 * @param data
 */
const savehashedTxId = async (data: { chainType: string; txId: string; amount: string; signature: string; hashedTxId: string }) => {
  try {
    const _tx = await prisma.teleporter.findUnique({
      where: { hashedTxId: data.hashedTxId }
    })
    if (_tx) {
      console.log("::Already Existed Tx")
    } else {
      await prisma.teleporter.create({ data })
    }
  } catch (err) {
    console.log(err)
    console.log("Failed to save tx to db")
  }
}

/**
 * get EVM transaction
 * @param txHash
 * @param w3From
 * @returns
 */
const getEvmTransactionUsingTxId = async (txId: string, w3From: Web3<RegisteredSubscription>) => {
  try {
    const transaction = await w3From.eth.getTransaction(txId)
    const transactionReceipt = await w3From.eth.getTransactionReceipt(txId)
    if (transaction && transactionReceipt) {
      // console.log("::Transaction: ", transaction, "::Transaction Receipt:", transactionReceipt)
      const tx = { ...transaction, ...transactionReceipt }
      if (transactionReceipt.logs.length === 0) {
        return {
          status: false,
          msg: "there was a problem with the transaction receipt. Null logs",
          payload: null
        }
      }
      const teleporter = String(transactionReceipt?.to)
      const _addressOfLog0 = String(transactionReceipt?.logs[0]?.address)
      const _addressToken = _addressOfLog0.toLowerCase() === teleporter.toLowerCase() ? "0x0000000000000000000000000000000000000000" : _addressOfLog0

      console.log("::fromTokenAddress: =======>", _addressToken)

      const from = transaction.from
      const abi = ["event BridgeBurned (address depositor, uint256 amt, address token)", "event VaultDeposit (address depositor, uint256 amt, address token)"]
      const iface = new Interface(abi)
      const eventLog = tx.logs

      //@ts-expect-error "_event type not matching"
      const _logs = await Promise.all(eventLog.map((e) => iface.parseLog(e)))
      const _log = _logs.filter((l) => l !== null)[0]

      if (!_log) {
        return {
          status: false,
          msg: "No tokens were vaulted or burned.",
          payload: null
        }
      }

      const _eventName: string = _log.name
      const _caller: string = _log.args[0]
      const _tokenAmount: string = _log.args[1]
      const _fromTokenAddress: string = _log.args[2]

      const transactionObj = {
        teleporter, //source network's telepor bridge address
        token: _fromTokenAddress, //token address
        from, //caller address
        eventName: _eventName, //type
        value: _tokenAmount // amount of token
      }
      return Promise.resolve({
        status: true,
        msg: "success",
        payload: transactionObj
      })
    } else {
      return {
        status: false,
        msg: "Cannot find transaction from this txId",
        payload: null
      }
    }
  } catch (err) {
    return {
      status: false,
      msg: "bad transaction hash, no transaction on chain",
      payload: null
    }
  }
}
